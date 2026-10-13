FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.9.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY patches/ ./patches/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS web
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    TWITTER_LITE_AUTH_MODE=none \
    TWITTER_LITE_ORIGIN=http://localhost:3000 \
    TWITTER_LITE_DB_PATH=/data/workspace.sqlite
WORKDIR /app
COPY --from=build --chown=node:node /app/.output/ ./.output/
RUN mkdir -p /data /data/workspaces /run/ori && chown -R node:node /data /run/ori
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/auth').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", ".output/server/index.mjs"]
