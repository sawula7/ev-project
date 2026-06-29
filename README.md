# EV Charging Marketplace

Two-sided EV charging marketplace. Drivers find chargers and pay via in-app wallet. Charger owners monetize through the platform.

## Structure

```
apps/
  backend/        Node.js + TypeScript backend (REST API + OCPP 1.6J CSMS)
  driver-app/     React Native driver app (Phase 1+)
  owner-app/      React Native owner app (Phase 3+)
  admin-web/      React admin dashboard (Phase 4+)
packages/
  shared/         Shared TypeScript types and constants
```

## Quick Start (backend)

```bash
cp apps/backend/.env.example apps/backend/.env
# Fill in MONGODB_URI, JWT_SECRET, and other required vars

yarn install
yarn dev:backend
```

The backend starts two listeners:
- `PORT` (default 3000) — REST API
- `OCPP_PORT` (default 9000) — OCPP 1.6J WebSocket server

Chargers connect to: `ws://<host>:9000/ocpp/<serialNumber>`
with HTTP Basic Auth (`Authorization: Basic base64(<serialNumber>:<authorizationKey>)`).

## Running tests

```bash
yarn test:backend
```

## Build phases

| Phase | Status | Scope |
|-------|--------|-------|
| 1 | In progress | Core loop: OCPP ↔ charger, session start/stop, billing records |
| 2 | Planned | Driver wallet top-up, ledger-based session payment |
| 3 | Planned | Owner accounts, charger claim flow, Owner app |
| 4 | Planned | Redis-backed horizontal scale, push notifications, reconciliation job |

## Open questions (must resolve before Phase 1 go-live)

- [ ] Payment gateway choice (PayHere / WebXPay / Stripe)
- [x] AWS region: `ap-southeast-1` (Singapore)
- [ ] `wss://` TLS confirmed on charger firmware?
- [ ] `AuthorizationKey`: per-unit or fleet-shared?
