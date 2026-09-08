FROM node:22-alpine
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @andthenn/db... build
ENV NODE_ENV=production
CMD ["node", "--import", "tsx", "packages/db/src/migrate.ts"]
