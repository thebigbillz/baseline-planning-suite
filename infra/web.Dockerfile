# One Dockerfile for the three federated builds. Everything up to `npm ci` is
# identical for all of them, so the three images share those layers.
FROM node:22-alpine AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
COPY services/people-api/package.json ./services/people-api/package.json
COPY services/delivery-api/package.json ./services/delivery-api/package.json
RUN npm ci --no-audit --no-fund
ARG APP
RUN npm run build --workspace @baseline/${APP}

FROM nginx:1.27-alpine
ARG APP
ARG ROLE=remote
COPY infra/nginx/${ROLE}.conf.template /etc/nginx/templates/default.conf.template
COPY infra/nginx/write-config.sh /docker-entrypoint.d/15-write-config.sh
RUN chmod +x /docker-entrypoint.d/15-write-config.sh
COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html
ENV ROLE=${ROLE}
