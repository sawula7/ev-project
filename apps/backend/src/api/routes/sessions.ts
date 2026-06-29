import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ChargingSession } from '../../models/ChargingSession';
import { Charger } from '../../models/Charger';
import { authenticate, AuthRequest, requireRole } from '../middleware/authenticate';
import { sendRemoteStart, sendRemoteStop } from '../../ocpp/remoteCommands';
import { ChargerStatus, SessionStatus } from '@ev/shared';

export const sessionsRouter = Router();

sessionsRouter.use(authenticate);

const startSchema = z.object({
  chargerId: z.string(),
  connectorId: z.number().int().positive().default(1),
});

// POST /sessions/start
sessionsRouter.post(
  '/start',
  requireRole('driver'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const body = startSchema.parse(req.body);
      const driverId = req.user!.sub;

      const charger = await Charger.findById(body.chargerId);
      if (!charger || charger.status !== ChargerStatus.IDLE) {
        res.status(400).json({ success: false, error: 'Charger not available' });
        return;
      }

      // Check driver has no active session
      const activeSession = await ChargingSession.findOne({
        driverId,
        status: { $in: [SessionStatus.INITIATED, SessionStatus.ACTIVE] },
      });
      if (activeSession) {
        res.status(409).json({ success: false, error: 'Session already active' });
        return;
      }

      const session = await ChargingSession.create({
        driverId,
        chargerId: charger._id,
        ownerId: charger.ownerId,
        status: SessionStatus.INITIATED,
      });

      const accepted = await sendRemoteStart(
        charger.serialNumber,
        session._id.toString(),
        body.connectorId
      );

      if (!accepted) {
        session.status = SessionStatus.FAILED;
        await session.save();
        res.status(502).json({ success: false, error: 'Charger rejected remote start' });
        return;
      }

      res.status(201).json({ success: true, data: { sessionId: session._id } });
    } catch (err) {
      next(err);
    }
  }
);

// POST /sessions/:id/stop
sessionsRouter.post(
  '/:id/stop',
  requireRole('driver'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const session = await ChargingSession.findById(req.params.id);
      if (!session || session.driverId.toString() !== req.user!.sub) {
        res.status(404).json({ success: false, error: 'Session not found' });
        return;
      }
      if (session.status !== SessionStatus.ACTIVE) {
        res.status(400).json({ success: false, error: 'Session not active' });
        return;
      }

      const charger = await Charger.findById(session.chargerId);
      if (!charger || !session.ocppTransactionId) {
        res.status(400).json({ success: false, error: 'Cannot stop session' });
        return;
      }

      session.status = SessionStatus.STOPPING;
      await session.save();

      const accepted = await sendRemoteStop(charger.serialNumber, session.ocppTransactionId);
      if (!accepted) {
        session.status = SessionStatus.ACTIVE;
        await session.save();
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
sessionsRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const session = await ChargingSession.findById(req.params.id);
    if (!session || session.driverId.toString() !== req.user!.sub) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }
    res.json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
});

// GET /sessions — driver's session history
sessionsRouter.get('/', requireRole('driver'), async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const sessions = await ChargingSession.find({ driverId: req.user!.sub })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, data: sessions });
  } catch (err) {
    next(err);
  }
});
