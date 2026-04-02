FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm install

COPY tsconfig.json ./
COPY src ./src/

RUN npx prisma generate
RUN npx tsc

# ── Production stage ──────────────────────────────────────────────────────────

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production

USER node

HEALTHCHECK --interval=60s --timeout=5s --retries=3 CMD node -e "process.exit(0)" || exit 1

CMD ["node", "dist/index.js"]
