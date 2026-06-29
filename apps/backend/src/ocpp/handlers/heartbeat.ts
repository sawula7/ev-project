import { Charger } from '../../models/Charger';

export async function handleHeartbeat(chargePointId: string) {
  await Charger.updateOne(
    { serialNumber: chargePointId },
    { $set: { lastHeartbeat: new Date() } }
  );
  return { currentTime: new Date().toISOString() };
}
