# CarbonID — Climate Action Platform

CarbonID is a consumer climate-tech platform that helps users measure their carbon footprint, understand major emission sources, take action through verified micro-offset purchases, and maintain a shareable carbon passport.

## Architecture

*   **Frontend**: React (Vite), Tailwind CSS, Zustand, React Query, Recharts.
*   **Backend**: Node.js, Express, Prisma.
*   **Database**: SQLite (Local Dev) / PostgreSQL (Production).
*   **Deployment**: Docker, Nginx.

## 1. Local Development (SQLite)
The easiest way to develop locally is using the zero-config SQLite setup. No Docker required.

### Setup
\`\`\`bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Setup Database (SQLite is the default)
cd backend
npm run db:push
npm run seed
\`\`\`

### Running Locally
Open two terminal windows:

**Terminal 1 (Backend API)**
\`\`\`bash
cd backend
npm run dev
# Server running on http://localhost:5000
\`\`\`

**Terminal 2 (Frontend)**
\`\`\`bash
cd frontend
npm run dev
# App running on http://localhost:3000
\`\`\`

## 2. Local Production-Like Environment (Docker Compose)
To test the production build (PostgreSQL, Nginx, built frontend, compiled backend) locally:

\`\`\`bash
# Build and start all services
docker compose up --build -d

# Check status
docker compose ps
\`\`\`
The frontend will be available at `http://localhost:8080`.
The backend API handles internal requests.

### Initializing the Docker Database
Once the containers are running, you need to push the schema and seed the database in the backend container:
\`\`\`bash
docker exec -it carbonid-api npm run db:push:prod
docker exec -it carbonid-api npm run seed
\`\`\`

## 3. Production Deployment (PostgreSQL)

For a real production environment (e.g., pulling a managed PostgreSQL instance from Supabase/Neon and deploying on a VPS/Render):

### Environment Variables
Set the following on your production server (see `backend/.env.production.example`):
\`\`\`env
DATABASE_URL="postgresql://user:password@host:5432/db"
NODE_ENV="production"
JWT_ACCESS_SECRET="your-strong-secret"
JWT_REFRESH_SECRET="your-strong-refresh-secret"
FRONTEND_URL="https://yourdomain.com"
\`\`\`

### Build and Deploy
You can use the provided Dockerfiles:
1.  `backend/Dockerfile`: Multi-stage build producing a lean Node.js image running on port 5000.
2.  `frontend/Dockerfile`: Multi-stage build producing static assets served by Nginx on port 80.

### Database Migrations
In production, use `migrate deploy` instead of `db push` to apply schema changes safely:
\`\`\`bash
cd backend
npm run generate:prod
npm run db:migrate:deploy
npm run seed
\`\`\`

## Project Structure
*   `backend/prisma/`
    *   `schema.prisma`: Schema for local SQLite development.
    *   `schema.production.prisma`: Schema for PostgreSQL production.
*   `nginx/default.conf`: Nginx configuration for serving the frontend and proxying `/api` requests.
*   `docker-compose.yml`: Local production-like test environment.
