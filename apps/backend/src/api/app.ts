import express from 'express';
import { authRouter } from './routes/auth';
import { chargersRouter } from './routes/chargers';
import { sessionsRouter } from './routes/sessions';
import { walletRouter } from './routes/wallet';
import { errorHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  app.use('/auth', authRouter);
  app.use('/chargers', chargersRouter);
  app.use('/sessions', sessionsRouter);
  app.use('/wallet', walletRouter);

  app.use(errorHandler);

  return app;
}
