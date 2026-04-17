import { Router } from 'express';
import multer from 'multer';
import { getHistory, processCsv } from './imports.controller';
import { authenticate } from '../../middleware/auth';

const router = Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit should safely handle several thousand rows
});

router.post('/csv', authenticate, upload.single('file'), processCsv);
router.get('/history', authenticate, getHistory);

export default router;
