# EV Charging Marketplace — Project Context

## Build Brief Summary
Two-sided EV charging marketplace. Drivers find chargers and pay via wallet. Charger owners monetize through the platform. Backend is OCPP 1.6J CSMS + financial intermediary.

## Stack
- Backend: Node.js + TypeScript, Express
- OCPP: `ocpp-rpc` library (OCPP 1.6J — NOT 2.0.1)
- DB: MongoDB (Atlas)
- Cache/State: Redis (ElastiCache)
- Mobile: React Native (two apps: Driver, Owner)
- Admin: React web
- Infra: AWS ECS Fargate + ALB

## Hardware Facts (confirmed, do not re-derive)
- OCPP 1.6J, charger connects outbound (charger = client, our backend = CSMS/server)
- HTTP Basic Auth on WebSocket handshake (Security Profile 1)
- `AuthorizeRemoteTxRequests` OFF — RemoteStartTransaction starts directly
- `MeterValueSampleInterval` 60s, `ClockAlignedDataInterval` 900s
- `WebSocketPingInterval` 0 — implement server-side heartbeat watchdog
- Vendor: goiot (goiot.net)

## Non-Negotiable Rules
- All money = integers in smallest currency unit (no floats ever)
- Every financial mutation has an idempotency key
- Wallet transfers = single atomic MongoDB multi-document transaction
- Periodic reconciliation job required

## Build Phases
1. Phase 1 (current): Core loop, single charger, no marketplace
2. Phase 2: Wallet + double-entry ledger
3. Phase 3: Marketplace (Owner accounts, claim flow, Owner app)
4. Phase 4: Hardening, scale, push notifications, reconciliation

## Open Questions (flag before assuming)
- Payment gateway choice (PayHere / WebXPay / Stripe / other)
- AWS region: ap-southeast-1 (Singapore) ✓ confirmed
- wss:// support on charger firmware
- AuthorizationKey: per-unit or fleet-shared?
