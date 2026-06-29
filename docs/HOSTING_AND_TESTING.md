# Hosting & Testing Guide

## Part 1 — Local Development

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | 20+ | https://nodejs.org |
| Yarn | 1.x | `npm i -g yarn` |
| Docker + Docker Compose | any recent | https://docker.com |
| Expo CLI | latest | `npm i -g expo-cli` |

---

### 1.1 Start the backend locally

```bash
# Clone the repo and install deps
yarn install

# Copy and fill in env vars
cp apps/backend/.env.example apps/backend/.env
```

Edit `apps/backend/.env` — minimum required for local dev:

```env
MONGODB_URI=mongodb://localhost:27017/ev_charging
REDIS_URL=redis://localhost:6379
JWT_SECRET=any-string-at-least-32-chars-long-here
PORT=3000
OCPP_PORT=9000
NODE_ENV=development
COMMISSION_RATE_BPS=1000
```

Start MongoDB and Redis via Docker, then the backend:

```bash
# Start MongoDB + Redis
docker compose up mongo redis -d

# Start backend (hot-reload)
yarn dev:backend
```

You should see:
```
MongoDB connected
Redis connected
REST API listening on port 3000
OCPP server listening on port 9000
Heartbeat watchdog started
```

Health check:
```bash
curl http://localhost:3000/health
# → {"ok":true}
```

---

### 1.2 Run unit tests

```bash
yarn test:backend
```

Expected output:
```
PASS src/__tests__/auth.test.ts
PASS src/__tests__/billing.test.ts
PASS src/__tests__/reconciliation.test.ts
```

---

### 1.3 Simulate an OCPP charger (no real hardware needed)

Install the OCPP client simulator:

```bash
npm i -g ocpp-charger  # or use the script below
```

Or use this Node.js one-liner to connect a fake charger:

```bash
node -e "
const { RPCClient } = require('ocpp-rpc');
const client = new RPCClient({
  endpoint: 'ws://localhost:9000/ocpp/TESTUNIT001',
  identity: 'TESTUNIT001',
  protocols: ['ocpp1.6'],
  strictMode: false,
  headers: {
    Authorization: 'Basic ' + Buffer.from('TESTUNIT001:changeme').toString('base64')
  }
});
client.connect().then(async () => {
  console.log('Connected');
  const resp = await client.call('BootNotification', {
    chargePointVendor: 'goiot', chargePointModel: 'TestUnit'
  });
  console.log('BootNotification:', resp);
  setInterval(async () => {
    const h = await client.call('Heartbeat', {});
    console.log('Heartbeat:', h);
  }, 30000);
  client.handle('RemoteStartTransaction', async ({ params }) => {
    console.log('RemoteStart received:', params);
    await client.call('StartTransaction', {
      connectorId: 1,
      idTag: params.idTag,
      meterStart: 0,
      timestamp: new Date().toISOString()
    });
    return { status: 'Accepted' };
  });
  client.handle('RemoteStopTransaction', async ({ params }) => {
    console.log('RemoteStop received:', params);
    await client.call('StopTransaction', {
      transactionId: params.transactionId,
      meterStop: 5000,
      timestamp: new Date().toISOString(),
      reason: 'Remote'
    });
    return { status: 'Accepted' };
  });
});
"
```

**Before running this**, provision the charger in the DB:

```bash
# Create an admin JWT manually for testing
node -e "
require('dotenv').config({ path: 'apps/backend/.env' });
const jwt = require('jsonwebtoken');
console.log(jwt.sign({ sub: 'admin', role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1d' }));
" 2>/dev/null || npx ts-node -e "
import dotenv from 'dotenv'; dotenv.config({ path: 'apps/backend/.env' });
import jwt from 'jsonwebtoken';
console.log(jwt.sign({ sub: 'admin', role: 'admin' }, process.env.JWT_SECRET!, { expiresIn: '1d' }));
"
```

Then provision the test charger via the admin API:

```bash
ADMIN_TOKEN="<token from above>"

curl -X POST http://localhost:3000/admin/chargers \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "serialNumber": "TESTUNIT001",
    "authorizationKey": "changeme",
    "connectorType": "Type2",
    "location": { "lat": 6.9271, "lng": 79.8612, "address": "Colombo Test Site" }
  }'
```

---

### 1.4 End-to-end test flow (manual)

With the simulated charger running:

```bash
# 1. Register a driver
curl -X POST http://localhost:3000/auth/driver/register \
  -H "Content-Type: application/json" \
  -d '{"email":"driver@test.com","password":"password123","name":"Test Driver"}'
# → { "data": { "token": "eyJ..." } }

DRIVER_TOKEN="<token>"

# 2. List chargers
curl http://localhost:3000/chargers \
  -H "Authorization: Bearer $DRIVER_TOKEN"

CHARGER_ID="<_id from response>"

# 3. Start a session
curl -X POST http://localhost:3000/sessions/start \
  -H "Authorization: Bearer $DRIVER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"chargerId\":\"$CHARGER_ID\"}"
# → { "data": { "sessionId": "..." } }

SESSION_ID="<sessionId>"

# 4. Poll session status (watch energy accumulate)
curl http://localhost:3000/sessions/$SESSION_ID \
  -H "Authorization: Bearer $DRIVER_TOKEN"

# 5. Stop the session
curl -X POST http://localhost:3000/sessions/$SESSION_ID/stop \
  -H "Authorization: Bearer $DRIVER_TOKEN"

# 6. Check final session (grossAmount, energyDeliveredWh)
curl http://localhost:3000/sessions/$SESSION_ID \
  -H "Authorization: Bearer $DRIVER_TOKEN"
```

---

### 1.5 Start the Admin Web

```bash
yarn dev:admin
# Open http://localhost:5173
# Paste your admin JWT token to log in
```

---

### 1.6 Start the mobile apps (Expo)

```bash
# Driver app
cd apps/driver-app
EXPO_PUBLIC_API_URL=http://<your-local-ip>:3000 npx expo start

# Owner app (separate terminal)
cd apps/owner-app
EXPO_PUBLIC_API_URL=http://<your-local-ip>:3000 npx expo start
```

Use the Expo Go app on your phone, or press `a` for Android emulator / `i` for iOS simulator.

> **Note:** Use your machine's LAN IP (e.g. `192.168.1.x`), not `localhost`, when testing on a physical phone.

---

## Part 2 — Hosting on AWS (Production)

### 2.1 Prerequisites

- AWS account
- AWS CLI configured (`aws configure`)
- MongoDB Atlas cluster in `ap-southeast-1`
- Domain name (for TLS)

---

### 2.2 One-time infrastructure setup

#### MongoDB Atlas

1. Create a cluster in **Singapore (ap-southeast-1)**
2. Create a DB user and note the connection string
3. Whitelist your ECS task's VPC CIDR, or set up VPC peering / Atlas Private Endpoint

#### AWS: VPC, ECR, Secrets Manager

```bash
# Create ECR repository
aws ecr create-repository --repository-name ev-backend --region ap-southeast-1

# Store secrets (never in env files in prod)
aws secretsmanager create-secret --name ev/mongodb-uri \
  --secret-string "mongodb+srv://user:pass@cluster.mongodb.net/ev_charging" \
  --region ap-southeast-1

aws secretsmanager create-secret --name ev/jwt-secret \
  --secret-string "$(openssl rand -hex 32)" \
  --region ap-southeast-1

aws secretsmanager create-secret --name ev/redis-url \
  --secret-string "redis://your-elasticache-endpoint:6379" \
  --region ap-southeast-1
```

#### ElastiCache (Redis)

Create a Redis cluster in the same VPC as your ECS tasks, in a private subnet. Use the endpoint URL as `ev/redis-url` above.

---

### 2.3 Build and push the Docker image

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=ap-southeast-1
ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/ev-backend"

# Authenticate Docker to ECR
aws ecr get-login-password --region $AWS_REGION | \
  docker login --username AWS --password-stdin "$ECR_URI"

# Build (from repo root)
docker build -f apps/backend/Dockerfile -t ev-backend .

# Tag and push
docker tag ev-backend:latest "$ECR_URI:latest"
docker push "$ECR_URI:latest"
```

---

### 2.4 ECS Fargate task definition

Create **two ECS services** from the same image, using different `CMD` overrides or environment variables to split concerns. Both use the same Docker image.

**Task definition environment variables (pulled from Secrets Manager):**

```json
{
  "secrets": [
    { "name": "MONGODB_URI",  "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:ev/mongodb-uri" },
    { "name": "JWT_SECRET",   "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:ev/jwt-secret" },
    { "name": "REDIS_URL",    "valueFrom": "arn:aws:secretsmanager:ap-southeast-1:ACCOUNT:secret:ev/redis-url" }
  ],
  "environment": [
    { "name": "NODE_ENV",             "value": "production" },
    { "name": "PORT",                 "value": "3000" },
    { "name": "OCPP_PORT",            "value": "9000" },
    { "name": "COMMISSION_RATE_BPS",  "value": "1000" },
    { "name": "LOG_LEVEL",            "value": "info" }
  ]
}
```

**Recommended resource sizing (start small, scale up):**

| Service | CPU | Memory | Min tasks |
|---------|-----|--------|-----------|
| REST API | 256 | 512 MB | 2 |
| OCPP server | 512 | 1 GB | 1 |

---

### 2.5 Application Load Balancer routing

Create one ALB with HTTPS on port 443 (ACM certificate). Add two **listener rules**:

| Priority | Condition | Target Group |
|----------|-----------|--------------|
| 1 | Path is `/ocpp/*` | OCPP service (port 9000) |
| 2 | Default | REST API service (port 3000) |

**Enable WebSocket support** on the OCPP target group:
- Set stickiness: **None** (state is in Redis)
- Protocol: HTTP (TLS terminates at ALB)

Point your charger's OCPP URL to:
```
wss://your-domain.com/ocpp/<serialNumber>
```

---

### 2.6 Deploy admin web (S3 + CloudFront)

```bash
cd apps/admin-web
VITE_API_URL=https://your-domain.com yarn build

# Create S3 bucket
aws s3 mb s3://ev-admin-web --region ap-southeast-1

# Upload build
aws s3 sync dist/ s3://ev-admin-web --delete

# Create CloudFront distribution pointing to the S3 bucket
# (or use Amplify Hosting for zero-config)
```

---

### 2.7 Mobile app builds (EAS)

```bash
# Install EAS CLI
npm i -g eas-cli
eas login

# Set the API URL for production builds
# In apps/driver-app/app.config.ts → extra.apiUrl = "https://your-domain.com"

# Build Android APK / AAB
cd apps/driver-app
eas build --platform android --profile production

# Build iOS IPA
eas build --platform ios --profile production
```

---

## Part 3 — Testing Against a Real Charger (goiot unit)

### 3.1 Configure the charger

On the charger's web UI (or BLE config tool), set:

| Setting | Value |
|---------|-------|
| OCPP Server URL | `ws://your-domain.com/ocpp/<serialNumber>` (use `wss://` if confirmed supported) |
| Authorization Key | The `authorizationKey` you set when provisioning in admin |
| AuthorizeRemoteTxRequests | OFF |
| MeterValueSampleInterval | 60 |
| ClockAlignedDataInterval | 900 |
| WebSocketPingInterval | 0 |

### 3.2 Verify connection

Watch the backend logs:
```bash
# ECS logs via CloudWatch, or locally:
yarn dev:backend
```

You should see within 30 seconds of powering the charger:
```
OCPP client connected  { chargePointId: "YOURSERIAL" }
BootNotification received { chargePointVendor: "goiot", ... }
```

### 3.3 First full session test

1. Open the Admin Web → Chargers → confirm the charger shows status `idle`
2. Open the Driver App → Map → tap the charger pin → **Start Charging**
3. Watch the charger physically begin charging
4. Admin Web → Sessions → confirm session appears as `active`
5. Driver App → **Stop Charging**
6. Confirm session moves to `completed` with correct `energyDeliveredWh` and `grossAmount`

---

## Part 4 — Checklist Before Go-Live

- [ ] MongoDB Atlas: IP whitelist locked to ECS task subnet only
- [ ] All secrets in Secrets Manager (no plaintext env vars in task definition)
- [ ] TLS confirmed on charger firmware (use `wss://`) OR risk accepted for `ws://`
- [ ] ALB security group: allow 443 inbound from 0.0.0.0/0; block 3000/9000 from internet
- [ ] ECS tasks in private subnets, NAT Gateway for outbound
- [ ] Atlas backup enabled
- [ ] ElastiCache in-transit encryption enabled (update REDIS_URL to `rediss://`)
- [ ] `AuthorizationKey` per-unit confirmed (not a shared fleet key)
- [ ] Payment gateway integrated before opening to public drivers
- [ ] Admin JWT issuance process defined (currently manual — add admin auth route before Phase 4)
