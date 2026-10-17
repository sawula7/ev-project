# EV Charging — AWS Infrastructure (CDK)

## Region: ap-southeast-1 (Singapore)

## Architecture

```
Internet
  └── ALB (HTTPS :443)
        ├── /ocpp/*  →  OCPP Target Group  →  ECS Fargate (port 9000)
        └── /*       →  API Target Group   →  ECS Fargate (port 3000)

ECS Fargate tasks in private subnets
RDS PostgreSQL in private subnet (Drizzle ORM, see packages/db)
ElastiCache Redis in private subnet
fck-nat (EC2 t4g.nano) instead of NAT Gateway — ~$3/mo vs ~$35/mo
S3 + CloudFront for admin web
Secrets Manager for all secrets
```

## Stacks

| Stack | What it creates |
|-------|----------------|
| `ev-network-{env}` | VPC, subnets, fck-nat instance, security groups |
| `ev-cache-{env}` | ElastiCache Redis (private subnet) |
| `ev-db-{env}` | RDS PostgreSQL (private subnet, auto-generated credentials secret) |
| `ev-api-{env}` | ECR repo, ECS cluster, Fargate services, ALB |
| `ev-frontend-{env}` | S3 bucket + CloudFront for admin web |

## Prerequisites

```bash
# Install AWS CDK
npm i -g aws-cdk

# Configure AWS credentials
aws configure   # set region to ap-southeast-1

# Bootstrap CDK (once per account/region)
cdk bootstrap aws://ACCOUNT_ID/ap-southeast-1
```

## Secrets (create before first deploy)

The RDS database credentials are generated automatically by `ev-db-{env}`
(no manual secret needed for Postgres). You only need to create these:

```bash
ENV=prod   # or staging

aws secretsmanager create-secret --region ap-southeast-1 \
  --name "ev/$ENV/jwt-secret" \
  --secret-string "$(openssl rand -hex 32)"

aws secretsmanager create-secret --region ap-southeast-1 \
  --name "ev/$ENV/redis-url" \
  --secret-string "rediss://your-elasticache-endpoint:6379"

aws secretsmanager create-secret --region ap-southeast-1 \
  --name "ev/$ENV/ocpp-default-auth-key" \
  --secret-string "your-fleet-auth-key"
```

## Deploy

```bash
cd infra
yarn install

# Preview changes
cdk diff --context env=prod

# Deploy all stacks
cdk deploy --all --context env=prod

# Deploy with TLS certificate (ACM cert ARN in same region)
cdk deploy --all --context env=prod --context certificateArn=arn:aws:acm:...
```

## Build & push Docker image

After `cdk deploy`, use the ECR URI from the `ev-api-prod.EcrRepoUri` output:

```bash
ECR_URI=$(aws cloudformation describe-stacks \
  --stack-name ev-api-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`EcrRepoUri`].OutputValue' \
  --output text \
  --region ap-southeast-1)

aws ecr get-login-password --region ap-southeast-1 | \
  docker login --username AWS --password-stdin "$ECR_URI"

docker build -f apps/backend/Dockerfile -t ev-backend .
docker tag ev-backend:latest "$ECR_URI:latest"
docker push "$ECR_URI:latest"

# Force ECS to pull the new image
aws ecs update-service \
  --cluster ev-cluster-prod \
  --service ev-api-prod \
  --force-new-deployment \
  --region ap-southeast-1

aws ecs update-service \
  --cluster ev-cluster-prod \
  --service ev-ocpp-prod \
  --force-new-deployment \
  --region ap-southeast-1
```

## Deploy admin web

```bash
BUCKET=$(aws cloudformation describe-stacks \
  --stack-name ev-frontend-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`BucketName`].OutputValue' \
  --output text \
  --region ap-southeast-1)

DIST_ID=$(aws cloudformation describe-stacks \
  --stack-name ev-frontend-prod \
  --query 'Stacks[0].Outputs[?OutputKey==`DistributionId`].OutputValue' \
  --output text \
  --region ap-southeast-1)

cd apps/admin-web
VITE_API_URL=https://your-domain.com yarn build
aws s3 sync dist/ "s3://$BUCKET" --delete
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*"
```

## Push the Drizzle schema to RDS

RDS sits in a private subnet with no public access, so `drizzle-kit push`
can't reach it directly from your machine. Easiest path for now: run it
from inside the running API task via ECS Exec:

```bash
aws ecs execute-command --cluster ev-cluster-prod \
  --task <api-task-id> --container api --interactive \
  --command "npx drizzle-kit push --config packages/db/drizzle.config.ts" \
  --region ap-southeast-1
```

(Requires `enableExecuteCommand: true` on the service — not yet wired into
`ApiStack`. A dedicated migration Lambda, run once before each deploy, is
the more robust long-term answer — add it when schema changes become
frequent enough to justify it.)

## Staging environment

```bash
# Deploy a full isolated staging environment
cdk deploy --all --context env=staging
```

Each environment gets its own VPC, ECS cluster, Redis, and ALB.
Staging secrets live under `ev/staging/*` in Secrets Manager.

## Tear down

```bash
cdk destroy --all --context env=staging
```
