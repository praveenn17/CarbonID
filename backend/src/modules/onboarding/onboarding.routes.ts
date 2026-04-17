import { Router } from 'express';
import { submitOnboarding, getOnboarding } from './onboarding.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.post('/complete', authenticate, submitOnboarding);
router.get('/me', authenticate, getOnboarding);

export default router;
