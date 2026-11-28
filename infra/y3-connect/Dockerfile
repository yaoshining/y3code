FROM node:26-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@12.14.0
COPY .pnpmfile.cjs package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches/ patches/
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY infra/y3-connect/package.json infra/y3-connect/package.json
RUN pnpm --filter '@t3tools/y3-connect...' install --prod --frozen-lockfile

FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    Y3_CONNECT_DB=/data/y3-connect.sqlite \
    Y3_CONNECT_LISTEN_HOST=0.0.0.0
COPY --from=dependencies /app/ /app/
COPY packages/contracts/src/ packages/contracts/src/
COPY packages/shared/src/ packages/shared/src/
COPY infra/y3-connect/src/ infra/y3-connect/src/
RUN install -d -o node -g node -m 0700 /data
USER node
ENTRYPOINT ["node", "infra/y3-connect/src/main.ts"]
CMD ["serve"]
