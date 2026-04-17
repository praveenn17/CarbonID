FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies first (caching)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy remaining source code
COPY . .

# Generate Prisma Client specifically for production schema and compile TypeScript
RUN npm run generate:prod
RUN npm run build

# --- Production Image ---
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Expose API port
EXPOSE 5000

# Start server
CMD ["npm", "start"]
