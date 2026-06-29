/**
 * OCPP 1.6J charger simulator for local testing.
 *
 * Mimics a goiot charger: connects, boots, accepts RemoteStart/Stop,
 * sends MeterValues every 10s while charging.
 *
 * Usage:
 *   node scripts/simulate-charger.js
 *
 * Requirements:
 *   npm install ocpp-rpc ws   (run from repo root)
 */

const { RPCClient } = require('ocpp-rpc');

const SERIAL     = process.env.SERIAL   || 'TESTUNIT001';
const AUTH_KEY   = process.env.AUTH_KEY || 'testkey123';
const OCPP_URL   = process.env.OCPP_URL || `ws://localhost:9000/ocpp/${SERIAL}`;

let transactionId   = null;
let meterValueWh    = 0;        // cumulative Wh
let meterInterval   = null;

const client = new RPCClient({
  endpoint: OCPP_URL,
  identity: SERIAL,
  protocols: ['ocpp1.6'],
  strictMode: false,
  headers: {
    Authorization: 'Basic ' + Buffer.from(`${SERIAL}:${AUTH_KEY}`).toString('base64'),
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(msg, data) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`, data !== undefined ? JSON.stringify(data) : '');
}

function makeMeterValue(wh) {
  return {
    timestamp: new Date().toISOString(),
    sampledValue: [
      {
        value: String(wh),
        measurand: 'Energy.Active.Import.Register',
        unit: 'Wh',
        context: 'Sample.Periodic',
        format: 'Raw',
        location: 'Outlet',
      },
    ],
  };
}

// ── Connect ───────────────────────────────────────────────────────────────────

async function run() {
  log(`Connecting to ${OCPP_URL} as ${SERIAL} …`);
  await client.connect();
  log('Connected ✓');

  // ── BootNotification ──────────────────────────────────────────────────────
  const boot = await client.call('BootNotification', {
    chargePointVendor: 'goiot',
    chargePointModel:  'EV-Sim-1.0',
    chargePointSerialNumber: SERIAL,
    firmwareVersion: '1.2.3',
  });
  log('BootNotification →', boot);

  // ── StatusNotification: Available ────────────────────────────────────────
  await client.call('StatusNotification', {
    connectorId: 1,
    errorCode: 'NoError',
    status: 'Available',
    timestamp: new Date().toISOString(),
  });
  log('StatusNotification: Available');

  // ── Heartbeat loop ────────────────────────────────────────────────────────
  setInterval(async () => {
    const hb = await client.call('Heartbeat', {});
    log('Heartbeat →', hb);
  }, 30_000);

  // ── Handle RemoteStartTransaction ────────────────────────────────────────
  client.handle('RemoteStartTransaction', async ({ params }) => {
    log('← RemoteStartTransaction', params);

    const txId = Date.now();
    transactionId = txId;
    meterValueWh  = 0;

    // StatusNotification: Charging
    await client.call('StatusNotification', {
      connectorId: 1, errorCode: 'NoError', status: 'Charging',
      timestamp: new Date().toISOString(),
    });

    // StartTransaction
    const startResp = await client.call('StartTransaction', {
      connectorId: 1,
      idTag:       params.idTag,
      meterStart:  meterValueWh,
      timestamp:   new Date().toISOString(),
    });
    log('StartTransaction →', startResp);

    // MeterValues every 10s (real charger does 60s; use 10s to see results faster locally)
    meterInterval = setInterval(async () => {
      meterValueWh += 1000; // simulate 6 kW charger: 1000 Wh per 10 min → scaled to 10s for testing
      const mv = await client.call('MeterValues', {
        connectorId: 1,
        transactionId: txId,
        meterValue: [makeMeterValue(meterValueWh)],
      });
      log(`MeterValues sent (${meterValueWh} Wh) →`, mv);
    }, 10_000);

    return { status: 'Accepted' };
  });

  // ── Handle RemoteStopTransaction ─────────────────────────────────────────
  client.handle('RemoteStopTransaction', async ({ params }) => {
    log('← RemoteStopTransaction', params);

    clearInterval(meterInterval);

    // StopTransaction
    const stopResp = await client.call('StopTransaction', {
      transactionId: transactionId,
      meterStop:     meterValueWh,
      timestamp:     new Date().toISOString(),
      reason:        'Remote',
    });
    log('StopTransaction →', stopResp);

    transactionId = null;

    // StatusNotification: Available
    await client.call('StatusNotification', {
      connectorId: 1, errorCode: 'NoError', status: 'Available',
      timestamp: new Date().toISOString(),
    });
    log('StatusNotification: Available (session ended)');

    return { status: 'Accepted' };
  });

  log('Simulator ready — waiting for RemoteStartTransaction …');
}

run().catch((err) => {
  console.error('Simulator error:', err.message);
  process.exit(1);
});
