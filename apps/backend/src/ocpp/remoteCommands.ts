import { connectedChargers } from './server';
import { logger } from '../config/logger';

export async function sendRemoteStart(
  chargePointId: string,
  sessionId: string,
  connectorId = 1
): Promise<boolean> {
  const client = connectedChargers.get(chargePointId);
  if (!client) {
    logger.warn({ chargePointId }, 'RemoteStartTransaction: charger not connected');
    return false;
  }

  const response = await client.call('RemoteStartTransaction', {
    connectorId,
    idTag: sessionId, // we use session id as the idTag
  });

  const accepted = (response as { status: string }).status === 'Accepted';
  logger.info({ chargePointId, sessionId, accepted }, 'RemoteStartTransaction sent');
  return accepted;
}

export async function sendRemoteStop(
  chargePointId: string,
  transactionId: number
): Promise<boolean> {
  const client = connectedChargers.get(chargePointId);
  if (!client) {
    logger.warn({ chargePointId }, 'RemoteStopTransaction: charger not connected');
    return false;
  }

  const response = await client.call('RemoteStopTransaction', { transactionId });
  const accepted = (response as { status: string }).status === 'Accepted';
  logger.info({ chargePointId, transactionId, accepted }, 'RemoteStopTransaction sent');
  return accepted;
}
