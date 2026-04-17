import { Router } from 'express';
import { logManualEmission, getEmissions, getEmissionSummary, getFactors } from './emissions.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/factors', authenticate, getFactors);
router.post('/manual', authenticate, logManualEmission);
router.get('/', authenticate, getEmissions);
router.get('/summary', authenticate, getEmissionSummary);

export default router;
