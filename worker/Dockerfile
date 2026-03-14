FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --no-cache-dir openai-whisper --break-system-packages

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/index.js"]
