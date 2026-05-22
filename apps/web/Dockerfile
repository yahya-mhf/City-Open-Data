FROM node:20-alpine AS builder

WORKDIR /app
COPY apps/web/package*.json ./
COPY apps/web/node_modules ./node_modules
RUN npm rebuild

COPY apps/web/ .

RUN node ./node_modules/next/dist/bin/next build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.js ./

EXPOSE 3000
CMD ["npx", "next", "start"]
