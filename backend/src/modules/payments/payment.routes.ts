import { Router } from 'express';
import { createOrder, verifyPayment, handleWebhook, getOrders, markOrderFailed, downloadReceipt } from './payment.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

// Webhook must come FIRST — raw body is applied per-route in index.ts
router.post('/webhook', handleWebhook);

// Authenticated payment routes
router.post('/create-order', authenticate, createOrder);
router.post('/verify', authenticate, verifyPayment);
router.get('/orders', authenticate, getOrders);
router.post('/fail', authenticate, markOrderFailed);

router.get('/:orderId/receipt', authenticate, downloadReceipt);

export default router;
