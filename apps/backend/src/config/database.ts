import mongoose from 'mongoose';
import { config } from './index';
import { logger } from './logger';

export async function connectDatabase(): Promise<void> {
  mongoose.connection.on('disconnected', () =>
    logger.warn('MongoDB disconnected')
  );
  mongoose.connection.on('reconnected', () =>
    logger.info('MongoDB reconnected')
  );

  await mongoose.connect(config.mongoUri);
  logger.info('MongoDB connected');
}
