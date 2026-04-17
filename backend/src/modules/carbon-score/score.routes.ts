import { Router } from 'express';
import { getCurrentScore, getScoreHistory, recalculateScore } from './score.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/current', authenticate, getCurrentScore);
router.get('/history', authenticate, getScoreHistory);
router.post('/recalculate', authenticate, recalculateScore);

export default router;
