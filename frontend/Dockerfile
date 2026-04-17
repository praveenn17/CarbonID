FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies (context is project root, so path is frontend/)
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ .
RUN npm run build

# --- Nginx Server ---
FROM nginx:alpine

# Copy nginx config (accessible because context is project root)
COPY nginx/default.conf /etc/nginx/conf.d/default.conf

# Copy compiled frontend assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
