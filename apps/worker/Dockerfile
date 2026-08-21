FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @andthenn/worker... build
RUN pnpm --filter @andthenn/worker --prod deploy /opt/worker

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /opt/worker ./
EXPOSE 8080
ENV PORT=8080
CMD ["node", "dist/index.js"]
