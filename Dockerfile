# One image recipe for every Node service in the monorepo.
# Build with: docker build --build-arg SERVICE=api .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci && npm run build && npm prune --omit=dev

FROM node:22-alpine
ARG SERVICE
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages ./packages
COPY --from=build /app/services/${SERVICE} ./services/${SERVICE}
WORKDIR /app/services/${SERVICE}
USER node
EXPOSE 8080
CMD ["node", "dist/server.js"]
