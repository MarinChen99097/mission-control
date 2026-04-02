FROM node:22.22.0-slim AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

FROM base AS deps
# Copy only dependency manifests first for better layer caching
COPY package.json ./
COPY pnpm-lock.yaml* ./
# better-sqlite3 requires native compilation tools
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      echo "WARN: pnpm-lock.yaml not found in build context; pnpm install --no-frozen-lockfile" && \
      pnpm install --no-frozen-lockfile; \
    fi

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_PUBLIC_GATEWAY_OPTIONAL=true
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_PUBLIC_GOOGLE_CLIENT_ID=${NEXT_PUBLIC_GOOGLE_CLIENT_ID}
RUN pnpm build

FROM node:22.22.0-slim AS runtime

ARG MC_VERSION=dev
LABEL org.opencontainers.image.source="https://github.com/builderz-labs/mission-control"
LABEL org.opencontainers.image.description="Mission Control - operations dashboard"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.version="${MC_VERSION}"

WORKDIR /app
ENV NODE_ENV=production

# --- Litestream: SQLite replication to GCS ---
# Download and install litestream for persistent SQLite on Cloud Run
RUN apt-get update && apt-get install -y wget ca-certificates --no-install-recommends && \
    wget -qO /tmp/litestream.deb https://github.com/benbjohnson/litestream/releases/download/v0.3.13/litestream-v0.3.13-linux-amd64.deb && \
    dpkg -i /tmp/litestream.deb && \
    rm /tmp/litestream.deb && \
    apt-get purge -y wget && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Copy gateway skills manifest for remote skill sync
COPY gateway-skills.json ./gateway-skills.json
# Copy schema.sql needed by migration 001_init at runtime
COPY --from=build /app/src/lib/schema.sql ./src/lib/schema.sql
# Create data directory with correct ownership for SQLite
RUN mkdir -p .data && chown -R nextjs:nodejs .data
RUN echo 'const http=require("http");const r=http.get("http://localhost:"+(process.env.PORT||3000)+"/api/status?action=health",s=>{process.exit(s.statusCode===200?0:1)});r.on("error",()=>process.exit(1));r.setTimeout(4000,()=>{r.destroy();process.exit(1)})' > /app/healthcheck.js

# Litestream config
COPY litestream.yml /etc/litestream.yml
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh && \
    chmod 755 /app/docker-entrypoint.sh && \
    chmod -R a+rX /app/public/ /app/src/

# nextjs user needs write access to .data for SQLite
USER nextjs
ENV PORT=3000
EXPOSE 3000
ENV HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "/app/healthcheck.js"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
