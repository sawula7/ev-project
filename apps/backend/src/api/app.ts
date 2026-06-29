import express from 'express';
import { authRouter } from './routes/auth';
import { chargersRouter } from './routes/chargers';
import { sessionsRouter } from './routes/sessions';
import { walletRouter } from './routes/wallet';
import { ownerRouter } from './routes/owner';
import { adminRouter } from './routes/admin';
import { errorHandler } from './middleware/errorHandler';
import { authLimiter, apiLimiter } from './middleware/rateLimit';

export function createApp() {
  const app = express();

  app.use(express.json({ limit: '100kb' }));
  app.set('trust proxy', 1); // ALB sets X-Forwarded-For

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authLimiter, authRouter);
  app.use('/chargers', apiLimiter, chargersRouter);
  app.use('/sessions', apiLimiter, sessionsRouter);
  app.use('/wallet', apiLimiter, walletRouter);
  app.use('/owner', apiLimiter, ownerRouter);
  app.use('/admin', apiLimiter, adminRouter);

  app.use(errorHandler);

  return app;
}
