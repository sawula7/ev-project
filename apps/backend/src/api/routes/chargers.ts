import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Charger } from '../../models/Charger';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { ChargerStatus } from '@ev/shared';

export const chargersRouter = Router();

// GET /chargers — list available chargers (public, for driver map)
chargersRouter.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const chargers = await Charger.find({
      status: { $in: [ChargerStatus.IDLE, ChargerStatus.CHARGING] },
      ownerId: { $exists: true },
    }).select('-authorizationKey -claimCode');
    res.json({ success: true, data: chargers });
  } catch (err) {
    next(err);
  }
});

// GET /chargers/:id
chargersRouter.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const charger = await Charger.findById(req.params.id).select('-authorizationKey -claimCode');
    if (!charger) {
      res.status(404).json({ success: false, error: 'Charger not found' });
      return;
    }
    res.json({ success: true, data: charger });
  } catch (err) {
    next(err);
  }
});
