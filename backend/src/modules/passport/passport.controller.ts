import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';

export const getPassport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const passport = await prisma.carbonPassport.findUnique({
      where: { userId },
      include: {
        user: {
           select: {
              profile: {
                 select: { fullName: true }
              }
           }
        }
      }
    });

    if (!passport) {
      res.status(404).json({ message: 'Passport not found. Complete onboarding first.' });
      return;
    }

    res.status(200).json(passport);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
