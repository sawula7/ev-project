FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json yarn.lock ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/backend/package.json ./apps/backend/
RUN yarn install --frozen-lockfile

COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN yarn workspace @ev/shared build
RUN yarn workspace @ev/backend build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
RUN yarn install --frozen-lockfile --production

EXPOSE 3000 9000
CMD ["node", "apps/backend/dist/index.js"]
