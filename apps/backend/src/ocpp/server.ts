import { RPCServer, createRPCError } from 'ocpp-rpc';
import { IncomingMessage } from 'http';
import { logger } from '../config/logger';
import { config } from '../config';
import { Charger } from '../models/Charger';
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

export async function createOcppServer(): Promise<RPCServer> {
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
    const charger = await Charger.findOne({ serialNumber: chargePointId });

    const expectedKey = charger?.authorizationKey ?? config.ocppDefaultAuthKey;

    if (!password || password !== expectedKey) {
      logger.warn({ chargePointId }, 'OCPP auth failed');
      reject(new Error('Unauthorized'));
      return;
    }

    accept({ chargePointId, chargerId: charger?._id?.toString() });
  });

  server.on('client', async (client) => {
    const { chargePointId } = client.session as { chargePointId: string; chargerId?: string };
    logger.info({ chargePointId }, 'OCPP client connected');
    connectedChargers.set(chargePointId, client);

    // Mark charger as online if it was offline
    await Charger.updateOne(
      { serialNumber: chargePointId, status: ChargerStatus.OFFLINE },
      { $set: { status: ChargerStatus.IDLE } }
    );

    client.on('disconnect', async () => {
      logger.info({ chargePointId }, 'OCPP client disconnected');
      connectedChargers.delete(chargePointId);
      await getRedis().del(`ocpp:session:${chargePointId}`);
      await Charger.updateOne(
        { serialNumber: chargePointId },
        { $set: { status: ChargerStatus.OFFLINE } }
      );
    });

    // ── Handlers ──────────────────────────────────────────────────────────────

    client.handle('BootNotification', ({ params }) =>
      handleBootNotification(chargePointId, params)
    );

    client.handle('Heartbeat', () => handleHeartbeat(chargePointId));

    client.handle('StatusNotification', ({ params }) =>
      handleStatusNotification(chargePointId, params)
    );

    client.handle('StartTransaction', ({ params }) =>
      handleStartTransaction(chargePointId, params)
    );

    client.handle('StopTransaction', ({ params }) =>
      handleStopTransaction(chargePointId, params)
    );

    client.handle('MeterValues', ({ params }) =>
      handleMeterValues(chargePointId, params)
    );

    // Catch-all for unhandled messages — return NotImplemented
    client.handle(({ method }) => {
      logger.warn({ chargePointId, method }, 'Unhandled OCPP method');
      throw createRPCError('NotImplemented');
    });
  });

  return server;
}
