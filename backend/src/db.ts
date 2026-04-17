import { PrismaClient } from '@prisma/client';

// In development, log all queries + errors.
// In production, log only errors to avoid leaking SQL in logs.
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'info', 'warn', 'error']
    : ['error'],
});

export default prisma;
