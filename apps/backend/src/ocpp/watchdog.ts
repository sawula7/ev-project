import { connectedChargers } from './server';
import { Charger } from '../models/Charger';
import { ChargerStatus } from '@ev/shared';
import { logger } from '../config/logger';

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Called periodically to mark chargers whose connection dropped silently
export async function runHeartbeatWatchdog(): Promise<void> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const stale = await Charger.find({
    status: { $in: [ChargerStatus.IDLE, ChargerStatus.CHARGING] },
    lastHeartbeat: { $lt: cutoff },
  });

  for (const charger of stale) {
    const chargePointId = charger.serialNumber;
    if (!connectedChargers.has(chargePointId)) {
      logger.warn({ chargePointId }, 'Watchdog: marking charger offline');
      charger.status = ChargerStatus.OFFLINE;
      await charger.save();
    }
  }
}

export function startWatchdog(intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(() => {
    runHeartbeatWatchdog().catch((err) =>
      logger.error({ err }, 'Watchdog error')
    );
  }, intervalMs);
}
