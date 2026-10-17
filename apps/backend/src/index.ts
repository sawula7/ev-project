import 'dotenv/config';
import http from 'http';
import { config } from './config';
import { logger } from './config/logger';
import { connectDatabase } from './config/database';
import { getRedis } from './config/redis';
import { createApp } from './api/app';
import { createOcppServer } from './ocpp/server';
import { startWatchdog } from './ocpp/watchdog';
import { startReconciliationJob } from './jobs/reconciliation';

async function main() {
  const db = connectDatabase();
  await getRedis().connect();

  // REST API
  const app = createApp(db);
  const httpServer = http.createServer(app);
  httpServer.listen(config.port, () => {
    logger.info(`REST API listening on port ${config.port}`);
  });

  // OCPP WebSocket server on separate port
  const ocppServer = await createOcppServer(db);
  ocppServer.listen(config.ocppPort);
  logger.info(`OCPP server listening on port ${config.ocppPort}`);

  startWatchdog(db);
  logger.info('Heartbeat watchdog started');

  startReconciliationJob(db);
  logger.info('Reconciliation job started (1h interval)');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received — shutting down');
    httpServer.close();
    ocppServer.close({});
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err }, 'Startup failed');
  process.exit(1);
});
