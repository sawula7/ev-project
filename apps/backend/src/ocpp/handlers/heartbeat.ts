import { eq } from 'drizzle-orm';
import { type Db, chargers } from '@ev/db';

export async function handleHeartbeat(db: Db, chargePointId: string) {
  await db
    .update(chargers)
    .set({ lastHeartbeat: new Date(), updatedAt: new Date() })
    .where(eq(chargers.serialNumber, chargePointId));
  return { currentTime: new Date().toISOString() };
}
