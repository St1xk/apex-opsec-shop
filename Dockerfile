FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 build-essential ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public
COPY data/products/catalog.json ./data/products/catalog.json
COPY data/products/README.txt ./data/products/README.txt

RUN mkdir -p /app/data/db /app/data/products \
  && chown -R node:node /app/data

USER node
EXPOSE 4242

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+ (process.env.PORT||4242) +'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
