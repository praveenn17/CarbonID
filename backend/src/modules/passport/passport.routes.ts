import { Router } from 'express';
import { getPassport } from './passport.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();

router.get('/me', authenticate, getPassport);

export default router;
