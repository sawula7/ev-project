import { Router, Response, NextFunction } from 'express';
import { eq, and, inArray, isNotNull } from 'drizzle-orm';
import { type Db, chargers } from '@ev/db';
import { AuthRequest } from '../middleware/authenticate';
import { ChargerStatus } from '@ev/shared';
import { toPublicCharger } from '../serializers';

export function chargersRouter(db: Db) {
  const router = Router();

  // GET /chargers — list available chargers (public, for driver map)
  router.get('/', async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const rows = await db
        .select()
        .from(chargers)
        .where(
          and(
            inArray(chargers.status, [ChargerStatus.IDLE, ChargerStatus.CHARGING]),
            isNotNull(chargers.ownerId)
          )
        );
      res.json({ success: true, data: rows.map(toPublicCharger) });
    } catch (err) {
      next(err);
    }
  });

  // GET /chargers/:id
  router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const [charger] = await db.select().from(chargers).where(eq(chargers.id, req.params.id));
      if (!charger) {
        res.status(404).json({ success: false, error: 'Charger not found' });
        return;
      }
      res.json({ success: true, data: toPublicCharger(charger) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
