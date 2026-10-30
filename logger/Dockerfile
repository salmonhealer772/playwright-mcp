FROM node:22-alpine

WORKDIR /app

COPY server.js .

RUN mkdir -p /var/log/playwright-mcp

EXPOSE 8931

CMD ["node", "server.js"]
