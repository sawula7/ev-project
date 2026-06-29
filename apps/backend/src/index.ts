import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { getRedis } from './config/redis';
import { createApp } from './api/app';
import { createOcppServer } from './ocpp/server';
import { startWatchdog } from './ocpp/watchdog';

async function main() {
  await connectDatabase();
  await getRedis().connect();

  // REST API
  const app = createApp();
  const httpServer = http.createServer(app);
  httpServer.listen(config.port, () => {
    logger.info(`REST API listening on port ${config.port}`);
  });

  // OCPP WebSocket server on separate port
  const ocppServer = await createOcppServer();
  ocppServer.listen(config.ocppPort);
  logger.info(`OCPP server listening on port ${config.ocppPort}`);

  startWatchdog();
  logger.info('Heartbeat watchdog started');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — shutting down');
    httpServer.close();
    ocppServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
