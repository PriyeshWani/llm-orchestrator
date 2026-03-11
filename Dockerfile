FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (none currently, but ready for future)
RUN npm install --production 2>/dev/null || true

# Copy source
COPY src/ ./src/
COPY config/ ./config/

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Run
CMD ["node", "src/server.js"]
