import { eq, and, inArray, lt } from 'drizzle-orm';
import { connectedChargers } from './server';
import { type Db, chargers } from '@ev/db';
import { ChargerStatus } from '@ev/shared';
import { logger } from '../config/logger';

const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// Called periodically to mark chargers whose connection dropped silently
export async function runHeartbeatWatchdog(db: Db): Promise<void> {
  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_MS);

  const stale = await db
    .select()
    .from(chargers)
    .where(
      and(
        inArray(chargers.status, [ChargerStatus.IDLE, ChargerStatus.CHARGING]),
        lt(chargers.lastHeartbeat, cutoff)
      )
    );

  for (const charger of stale) {
    const chargePointId = charger.serialNumber;
    if (!connectedChargers.has(chargePointId)) {
      logger.warn({ chargePointId }, 'Watchdog: marking charger offline');
      await db
        .update(chargers)
        .set({ status: ChargerStatus.OFFLINE, updatedAt: new Date() })
        .where(eq(chargers.id, charger.id));
    }
  }
}

export function startWatchdog(db: Db, intervalMs = 60_000): NodeJS.Timeout {
  return setInterval(() => {
    runHeartbeatWatchdog(db).catch((err) =>
      logger.error({ err }, 'Watchdog error')
    );
  }, intervalMs);
}
