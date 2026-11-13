# ySF app for Railway (or any Docker host). One always-on container; everything that must persist —
# the SQLite database, stored API data (Tank01/NHL caches, Fantrax history), logs — lives in /app/data,
# which is mounted as a persistent volume.
FROM node:22-bookworm-slim

# better-sqlite3 compiles a native module
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
# dev dependencies stay installed: the scheduler runs the data scripts with tsx
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# an empty schema so pages that read the database can build; the real database is the volume's
RUN npx tsx src/db/upgrade.ts && npm run build && rm -rf data

ENV NODE_ENV=production
EXPOSE 3000
# apply any new database upgrades, then serve (Railway sets PORT)
CMD ["sh", "-c", "npx tsx src/db/upgrade.ts && exec npx next start -p ${PORT:-3000}"]
