import { RPCServer, createRPCError } from 'ocpp-rpc';
import { IncomingMessage } from 'http';
import { eq } from 'drizzle-orm';
import { logger } from '../config/logger';
import { config } from '../config';
import { type Db, chargers } from '@ev/db';
import { getRedis } from '../config/redis';
import { handleBootNotification } from './handlers/bootNotification';
import { handleHeartbeat } from './handlers/heartbeat';
import { handleStatusNotification } from './handlers/statusNotification';
import { handleStartTransaction } from './handlers/startTransaction';
import { handleStopTransaction } from './handlers/stopTransaction';
import { handleMeterValues } from './handlers/meterValues';
import { ChargerStatus } from '@ev/shared';

// Maps chargePointId -> RPCClient so we can send RemoteStart/Stop
export const connectedChargers = new Map<string, InstanceType<typeof RPCServer>['clients'] extends Map<string, infer V> ? V : never>();

export async function createOcppServer(db: Db): Promise<RPCServer> {
  const server = new RPCServer({
    protocols: ['ocpp1.6'],
    strictMode: false, // goiot firmware may send non-standard fields
  });

  server.auth(async (accept, reject, handshakeRequest: IncomingMessage) => {
    // Extract chargePointId from URL path: /ocpp/<chargePointId>
    const url = handshakeRequest.url ?? '';
    const chargePointId = url.split('/').pop();

    if (!chargePointId) {
      reject(new Error('Missing chargePointId in URL'));
      return;
    }

    // Validate Basic Auth
    const authHeader = handshakeRequest.headers['authorization'] ?? '';
    const base64 = authHeader.replace(/^Basic\s+/i, '');
    const decoded = Buffer.from(base64, 'base64').toString('utf8');
    const [, password] = decoded.split(':');

    // Look up charger by serial number (chargePointId == serial number by convention)
    const [charger] = await db.select().from(chargers).where(eq(chargers.serialNumber, chargePointId));

    const expectedKey = charger?.authorizationKey ?? config.ocppDefaultAuthKey;

    if (!password || password !== expectedKey) {
      logger.warn({ chargePointId }, 'OCPP auth failed');
      reject(new Error('Unauthorized'));
      return;
    }

    accept({ chargePointId, chargerId: charger?.id });
  });

  server.on('client', async (client) => {
    const { chargePointId } = client.session as { chargePointId: string; chargerId?: string };
    logger.info({ chargePointId }, 'OCPP client connected');
    connectedChargers.set(chargePointId, client);

    // Mark charger as online if it was offline
    const [existing] = await db.select().from(chargers).where(eq(chargers.serialNumber, chargePointId));
    if (existing?.status === ChargerStatus.OFFLINE) {
      await db
        .update(chargers)
        .set({ status: ChargerStatus.IDLE, updatedAt: new Date() })
        .where(eq(chargers.serialNumber, chargePointId));
    }

    client.on('disconnect', async () => {
      logger.info({ chargePointId }, 'OCPP client disconnected');
      connectedChargers.delete(chargePointId);
      await getRedis().del(`ocpp:session:${chargePointId}`);
      await db
        .update(chargers)
        .set({ status: ChargerStatus.OFFLINE, updatedAt: new Date() })
        .where(eq(chargers.serialNumber, chargePointId));
    });

    // ── Handlers ──────────────────────────────────────────────────────────────

    client.handle('BootNotification', ({ params }) =>
      handleBootNotification(db, chargePointId, params)
    );

    client.handle('Heartbeat', () => handleHeartbeat(db, chargePointId));

    client.handle('StatusNotification', ({ params }) =>
      handleStatusNotification(db, chargePointId, params)
    );

    client.handle('StartTransaction', ({ params }) =>
      handleStartTransaction(db, chargePointId, params)
    );

    client.handle('StopTransaction', ({ params }) =>
      handleStopTransaction(db, chargePointId, params)
    );

    client.handle('MeterValues', ({ params }) =>
      handleMeterValues(db, chargePointId, params)
    );

    // Catch-all for unhandled messages — return NotImplemented
    client.handle(({ method }) => {
      logger.warn({ chargePointId, method }, 'Unhandled OCPP method');
      throw createRPCError('NotImplemented');
    });
  });

  return server;
}
