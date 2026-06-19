FROM node:22-slim

WORKDIR /app

COPY server/package*.json ./server/

WORKDIR /app/server
RUN npm ci --omit=dev

COPY server/ ./

ENV NODE_ENV=production
ENV PORT=80
ENV SQLITE_PATH=/app/server/data/dapai-jizhang.sqlite

EXPOSE 80

CMD ["npm", "start"]
