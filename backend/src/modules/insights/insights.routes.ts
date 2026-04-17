import { Router } from 'express';
import { generateInsights } from './insights.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/generate', authenticate, generateInsights);

export default router;
