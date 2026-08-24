FROM node:25-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g --force corepack && corepack enable \
    && groupadd -r -g 999 app && useradd -r -u 999 -g app -d /app -s /bin/sh app \
    && chown app:app /app

COPY --chown=app:app package.json pnpm-lock.yaml pnpm-workspace.yaml ./

USER app

RUN pnpm install --frozen-lockfile

COPY --chown=app:app . .

RUN pnpm run build

CMD ["pnpm", "start"]
