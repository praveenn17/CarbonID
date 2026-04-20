# 🌱 CarbonID — Climate Action Platform

 **Track. Understand. Offset. Act.**

CarbonID is a full-stack consumer climate-tech platform that helps users measure their carbon footprint, understand major emission sources, take action through verified micro-offset purchases, and maintain a shareable Carbon Passport.

🔗 **Live App**: [https://carbon-id-olive.vercel.app](https://carbon-id-olive.vercel.app)

---

## Features

-  **Authentication** — Secure JWT-based login & registration
-  **Dashboard** — Real-time carbon footprint analytics with charts
-  **Data Imports** — Drag-and-drop CSV upload with smart duplicate detection
-  **Marketplace** — Browse & purchase verified carbon offset projects via Razorpay
-  **Carbon Passport** — Shareable personal carbon identity card
-  **AI Insights** — Emission category breakdown and personalized recommendations
-  **Manual Activity Logging** — Log transport, food, utilities, and more

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React (Vite), TypeScript, Tailwind CSS, Zustand, React Query, Recharts |
| Backend | Node.js, Express.js, Prisma ORM |
| Database | SQLite (Local Dev) / PostgreSQL via Neon (Production) |
| Payments | Razorpay |
| Deployment | Vercel (Frontend) + Render (Backend) + Neon (DB) |

---

## Deployment

| Service | URL |
|---|---|
| 🌐 Frontend (Vercel) | [carbon-id-olive.vercel.app](https://carbon-id-olive.vercel.app) |
| ⚙️ Backend (Render) | [carbonid-backend.onrender.com](https://carbonid-backend.onrender.com) |
| 🗄️ Database (Neon) | PostgreSQL — Neon Serverless |

---

## Project Structure
carbonID/
|
|-- frontend/
|   |-- src/
|   |   |-- pages/           Route-level components
|   |   |-- components/      Reusable UI components
|   |   └-- stores/          Zustand state management
|   └-- vercel.json          SPA routing config
|
└-- backend/
    |-- src/
    |   └-- modules/
    |       |-- auth/            JWT authentication
    |       |-- emissions/       Emission logging
    |       |-- imports/         CSV import pipeline
    |       |-- payments/        Razorpay integration
    |       |-- passport/        Carbon Passport
    |       └-- carbon-score/
    └-- prisma/
        |-- schema.prisma              SQLite local dev
        └-- schema.production.prisma   PostgreSQL production


## 🛠️ Local Development (SQLite)

### 1. Install Dependencies
cd backend && npm install
cd ../frontend && npm install

### 2. Setup Database
cd backend
npm run db:push
npm run seed

### 3. Run Locally
**Terminal 1 — Backend**
cd backend
npm run dev
# http://localhost:5000

**Terminal 2 — Frontend**
cd frontend
npm run dev
# http://localhost:3000


### Render Build Command
npm install --include=dev && npm run generate:prod && npx prisma db push --schema=prisma/schema.production.prisma --accept-data-loss && npm run build


## CSV Import Format

Date,Description,Amount
2026-04-10,Uber Ride to Office,15.50
2026-04-12,Zomato Delivery Food,25.00
2026-04-13,Flight to Mumbai MMT,125.00


## 🧑‍💻 Built By

**Praveen Kumar** — [@praveenn17](https://github.com/praveenn17)
{krpraveen2212@gmailcom}


## License
MIT License
