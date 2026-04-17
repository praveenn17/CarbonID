import { Router } from 'express';
import { getProjects, getPurchaseHistory } from './marketplace.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Read-only project routes — purchase is now handled exclusively by /api/payments
router.get('/', authenticate, getProjects);
router.get('/history', authenticate, getPurchaseHistory);

// POST /:id/purchase intentionally removed — direct purchase bypasses payment verification.
// All purchases must go through: POST /api/payments/create-order → POST /api/payments/verify

export default router;
