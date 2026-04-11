FROM node:24-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src/ ./src/

# Default: run the Change Stream listener.
# Override with ["node", "src/full-sync.js"] for the re-index CronJob.
CMD ["node", "src/index.js"]
