# syntax=docker/dockerfile:1
FROM elixir:1.18.4-otp-27-slim AS build
ENV MIX_ENV=prod
WORKDIR /build
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mix local.hex --force && mix local.rebar --force
COPY mix.exs mix.lock ./
RUN mix deps.get --only prod && mix deps.compile
COPY lib ./lib
RUN mix release

FROM node:22-bookworm-slim AS runtime
ARG CODEX_VERSION=0.156.0
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git libncurses6 libstdc++6 openssl \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global "@openai/codex@${CODEX_VERSION}" \
    && npm cache clean --force
ENV LANG=C.UTF-8 \
    NODE_ENV=production \
    HOME=/home/node \
    CODEX_HOME=/data/codex \
    WORKSPACE_RUNTIME_ROOT=/data/runtime \
    WORKSPACE_RUNTIME_HOST=0.0.0.0 \
    WORKSPACE_RUNTIME_PORT=4318 \
    WORKSPACE_RUNTIME_TOKEN_FILE=/run/ori/runtime-token \
    RELEASE_DISTRIBUTION=none
WORKDIR /app
COPY --from=build --chown=node:node /build/_build/prod/rel/workspace_runtime ./
COPY vendor/symphony /app/licenses/symphony
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/runtime-entrypoint
COPY healthcheck.mjs /app/healthcheck.mjs
RUN mkdir -p /data/runtime /data/codex /data/workspaces /run/ori \
    && chown -R node:node /data /run/ori
USER node
EXPOSE 4318
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 CMD ["node", "/app/healthcheck.mjs"]
ENTRYPOINT ["runtime-entrypoint"]
CMD ["bin/workspace_runtime", "start"]
