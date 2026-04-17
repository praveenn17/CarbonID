import { Router } from 'express';
import { getProfile, updateProfile } from './user.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/me', authenticate, getProfile);
router.patch('/me', authenticate, updateProfile);

export default router;
