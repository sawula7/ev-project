import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { type Db, chargers, chargingSessions } from '@ev/db';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { sendRemoteStart, sendRemoteStop } from '../../ocpp/remoteCommands';
import { ChargerStatus, SessionStatus } from '@ev/shared';

export function sessionsRouter(db: Db) {
  const router = Router();
  router.use(authenticate);

  const startSchema = z.object({
    chargerId: z.string(),
    connectorId: z.number().int().positive().default(1),
  });

  // POST /sessions/start
  router.post(
    '/start',
    requireRole('driver'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const body = startSchema.parse(req.body);
        const driverId = req.user!.sub;

        const [charger] = await db.select().from(chargers).where(eq(chargers.id, body.chargerId));
        if (!charger || charger.status !== ChargerStatus.IDLE) {
          res.status(400).json({ success: false, error: 'Charger not available' });
          return;
        }

        // Check driver has no active session
        const [activeSession] = await db
          .select()
          .from(chargingSessions)
          .where(
            and(
              eq(chargingSessions.driverId, driverId),
              inArray(chargingSessions.status, [SessionStatus.INITIATED, SessionStatus.ACTIVE])
            )
          );
        if (activeSession) {
          res.status(409).json({ success: false, error: 'Session already active' });
          return;
        }

        const [session] = await db
          .insert(chargingSessions)
          .values({
            driverId,
            chargerId: charger.id,
            ownerId: charger.ownerId ?? null,
            status: SessionStatus.INITIATED,
          })
          .returning();

        const accepted = await sendRemoteStart(charger.serialNumber, session.id, body.connectorId);

        if (!accepted) {
          await db
            .update(chargingSessions)
            .set({ status: SessionStatus.FAILED, updatedAt: new Date() })
            .where(eq(chargingSessions.id, session.id));
          res.status(502).json({ success: false, error: 'Charger rejected remote start' });
          return;
        }

        res.status(201).json({ success: true, data: { sessionId: session.id } });
      } catch (err) {
        next(err);
      }
    }
  );

  // POST /sessions/:id/stop
  router.post(
    '/:id/stop',
    requireRole('driver'),
    async (req: AuthRequest, res: Response, next: NextFunction) => {
      try {
        const [session] = await db.select().from(chargingSessions).where(eq(chargingSessions.id, req.params.id));
        if (!session || session.driverId !== req.user!.sub) {
          res.status(404).json({ success: false, error: 'Session not found' });
          return;
        }
        if (session.status !== SessionStatus.ACTIVE) {
          res.status(400).json({ success: false, error: 'Session not active' });
          return;
        }

        const [charger] = await db.select().from(chargers).where(eq(chargers.id, session.chargerId));
        if (!charger || !session.ocppTransactionId) {
          res.status(400).json({ success: false, error: 'Cannot stop session' });
          return;
        }

        await db
          .update(chargingSessions)
          .set({ status: SessionStatus.STOPPING, updatedAt: new Date() })
          .where(eq(chargingSessions.id, session.id));

        const accepted = await sendRemoteStop(charger.serialNumber, session.ocppTransactionId);
        if (!accepted) {
          await db
            .update(chargingSessions)
            .set({ status: SessionStatus.ACTIVE, updatedAt: new Date() })
            .where(eq(chargingSessions.id, session.id));
          res.status(502).json({ success: false, error: 'Charger rejected remote stop' });
          return;
        }

        res.json({ success: true, data: { message: 'Stop requested' } });
      } catch (err) {
        next(err);
      }
    }
  );

  // GET /sessions/:id
  router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const [session] = await db.select().from(chargingSessions).where(eq(chargingSessions.id, req.params.id));
      if (!session || session.driverId !== req.user!.sub) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }
      res.json({ success: true, data: session });
    } catch (err) {
      next(err);
    }
  });

  // GET /sessions — driver's session history
  router.get('/', requireRole('driver'), async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select()
        .from(chargingSessions)
        .where(eq(chargingSessions.driverId, req.user!.sub))
        .orderBy(desc(chargingSessions.createdAt))
        .limit(50);
      res.json({ success: true, data: rows });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
