import { ChargingSession } from '../../models/ChargingSession';
import { Charger } from '../../models/Charger';
import { getRedis } from '../../config/redis';
import { logger } from '../../config/logger';
import { connectedChargers } from '../server';
import { SessionStatus } from '@ev/shared';

interface SampledValue {
  value: string;
  context?: string;
  format?: string;
  measurand?: string;
  phase?: string;
  location?: string;
  unit?: string;
}

interface MeterValue {
  timestamp: string;
  sampledValue: SampledValue[];
}

interface MeterValuesParams {
  connectorId: number;
  transactionId?: number;
  meterValue: MeterValue[];
}

export async function handleMeterValues(
  chargePointId: string,
  params: MeterValuesParams
) {
  const redis = getRedis();
  const cached = await redis.get(`ocpp:session:${chargePointId}`);

  if (!cached) {
    logger.warn({ chargePointId }, 'MeterValues: no active session in cache');
    return {};
  }

  const { sessionId, meterStart } = JSON.parse(cached) as {
    sessionId: string;
    transactionId: number;
    meterStart: number;
  };

  // Extract Energy.Active.Import.Register (cumulative Wh) from meter values
  let latestEnergyWh: number | null = null;
  for (const mv of params.meterValue) {
    for (const sv of mv.sampledValue) {
      if (
        (!sv.measurand || sv.measurand === 'Energy.Active.Import.Register') &&
        sv.unit !== 'kWh'
      ) {
        latestEnergyWh = parseFloat(sv.value);
      } else if (
        sv.measurand === 'Energy.Active.Import.Register' &&
        sv.unit === 'kWh'
      ) {
        latestEnergyWh = parseFloat(sv.value) * 1000;
      }
    }
  }

  if (latestEnergyWh === null) {
    return {};
  }

  const deliveredWh = Math.max(0, latestEnergyWh - meterStart);
  const session = await ChargingSession.findById(sessionId);
  if (!session || session.status !== SessionStatus.ACTIVE) return {};

  const charger = await Charger.findOne({ serialNumber: chargePointId });
  if (!charger) return {};

  // Compute cost: pricePerKwh (integer per kWh) * deliveredWh / 1000
  const grossAmount = Math.floor((charger.pricePerKwh * deliveredWh) / 1000);

  session.energyDeliveredWh = deliveredWh;
  session.accruedAmount = grossAmount;
  await session.save();

  logger.debug(
    { chargePointId, deliveredWh, grossAmount },
    'MeterValues updated'
  );

  // Auto-stop guard: if driver's wallet would be exhausted, stop the session
  // (Phase 2 — wallet check; for Phase 1 no wallet guard needed)

  return {};
}
