FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @andthenn/worker... build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production PORT=8080
WORKDIR /workspace
# The locked TS loader handles the existing workspace packages' extensionless ESM imports.
COPY --from=build /workspace ./
EXPOSE 8080
CMD ["node", "--import", "tsx", "apps/worker/src/index.ts"]
