import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';
import { z } from 'zod';

const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  avatarUrl: z.string().url().optional(),
});

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json({
      id: user.id,
      email: user.email,
      role: user.role,
      profile: user.profile,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const updatedProfile = await prisma.userProfile.update({
      where: { userId },
      data: parsed.data,
    });

    res.status(200).json({ message: 'Profile updated successfully', profile: updatedProfile });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
