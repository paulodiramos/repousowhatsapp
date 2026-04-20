FROM node:20-slim

RUN apt-get update && apt-get install -y \
    ca-certificates \
    --no-install-recommends && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* yarn.lock* ./
RUN if [ -f yarn.lock ]; then yarn install --production --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci --omit=dev; \
    else npm install --omit=dev; fi

COPY . .

RUN mkdir -p /data

EXPOSE 3000
CMD ["node", "index.js"]
