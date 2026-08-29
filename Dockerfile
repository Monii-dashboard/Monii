FROM node:25-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g --force corepack && corepack enable \
    && groupadd -r -g 999 app && useradd -r -u 999 -g app -d /app -s /bin/sh app \
    && chown app:app /app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=app:app apps/cli/package.json apps/cli/package.json
COPY --chown=app:app apps/web/package.json apps/web/package.json
COPY --chown=app:app packages/application/package.json packages/application/package.json
COPY --chown=app:app packages/server/package.json packages/server/package.json

USER app

RUN pnpm install --frozen-lockfile

COPY --chown=app:app . .

RUN pnpm run build

CMD ["pnpm", "--filter", "@monii/web", "start"]
