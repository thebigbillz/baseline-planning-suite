# The services have no runtime dependencies: Node runs the TypeScript directly
# (type stripping, Node 22.18+). Imports from @baseline/contracts are types only
# and disappear, so nothing else needs to be in the image.
FROM node:22-alpine
ARG SERVICE
WORKDIR /app/services/${SERVICE}
COPY services/${SERVICE}/src ./src
COPY seed /app/seed
ENV SEED_FILE=/app/seed/baseline-seed.json
# The named volume inherits this ownership the first time it is mounted.
RUN mkdir -p /data && chown node:node /data
USER node
CMD ["node", "src/server.ts"]
