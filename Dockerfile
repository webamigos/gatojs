FROM --platform=linux/amd64 node:22-alpine AS base

FROM base AS deps
WORKDIR /app

COPY package.json package-lock.json ./
# wa:workspaces:start
COPY packages/create-gato-app/package.json ./packages/create-gato-app/package.json
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/eslint-config/package.json ./packages/eslint-config/package.json
COPY packages/gato-cli/package.json ./packages/gato-cli/package.json
COPY packages/observability/package.json ./packages/observability/package.json
# wa:workspaces:end
RUN npm ci --ignore-scripts

FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV CHECKPOINT_DISABLE=1
RUN npx prisma generate
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV CHECKPOINT_DISABLE=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

RUN cd /tmp && npm init -y > /dev/null 2>&1 \
    && npm install prisma@7.10.1 dotenv@17.4.2 > /dev/null 2>&1 \
    && cp -rP /tmp/node_modules/* /app/node_modules/ \
    && mkdir -p /app/node_modules/.bin \
    && ln -sf ../prisma/build/index.js /app/node_modules/.bin/prisma \
    && rm -rf /tmp/node_modules /tmp/package.json /tmp/package-lock.json \
    && chown -R nextjs:nodejs /app/node_modules

RUN mkdir -p /app/volumes/uploads && chown -R nextjs:nodejs /app/volumes

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
