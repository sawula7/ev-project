# Infrastructure

AWS region: `ap-southeast-1` (Singapore)

## Architecture overview

```
Internet
  └── ALB (HTTPS :443)
        ├── /ocpp/*  → OCPP Target Group  → ECS Fargate (OCPP service)
        └── /*       → API Target Group   → ECS Fargate (REST API service)

Fargate tasks → private subnets
NAT Gateway   → outbound (Atlas, payment gateway, SNS)
MongoDB Atlas → VPC peering or Private Endpoint
ElastiCache   → Redis (private subnet)
Secrets Manager → per-charger AuthorizationKey, JWT secret, gateway creds
SNS           → push notifications (APNs + FCM) — Phase 4
```

## Services

| Service | Container port | ALB rule |
|---------|---------------|----------|
| REST API | 3000 | default (`/*`) |
| OCPP WS | 9000 | path `/ocpp/*` |

Both services share one Docker image but different ECS task definitions
so they can be scaled and deployed independently.

## ECS task environment variables

All secrets come from AWS Secrets Manager via ECS secret injection
(not baked into the image or passed as plaintext env vars).

Required:
- `MONGODB_URI`
- `JWT_SECRET`
- `REDIS_URL`
- `OCPP_DEFAULT_AUTH_KEY` (dev/test only — production uses per-unit keys from DB)

## TLS

TLS terminates at the ALB. The ALB forwards plain `ws://` and `http://`
to the Fargate tasks internally. ACM certificate covers the domain.

If charger firmware confirms `wss://` support, point the charger at the ALB
domain on port 443 — no changes needed on the server side.
