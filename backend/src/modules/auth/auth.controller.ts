import { Request, Response } from 'express';
import prisma from '../../db';
import { hashPassword, comparePasswords, generateAccessToken, getTokenExpiry } from '../../utils/auth';
import { z } from 'zod';
import { AuthRequest } from '../../middleware/auth';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }
    const { email, password, fullName } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ message: 'Email already in use' });
      return;
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: hashedPassword,
        profile: {
          create: {
            fullName,
          }
        }
      },
      include: {
        profile: true
      }
    });

    // Create initial CarbonScore based on current schema
    await prisma.carbonScore.create({
      data: {
        userId: user.id,
        scoreMode: 'manual',
        monthlyScore: 100, // Matching your 'score: 100' intent
        annualEstimate: 1200,
        month: new Date().getMonth() + 1,
        year: new Date().getFullYear(),
      }
    });

    // Create initial CarbonPassport based on current schema
    await prisma.carbonPassport.create({
      data: {
        userId: user.id,
        carbonGrade: 'C', // Matches A/B/C/D mapping instead of Bronze
        cumulativeFootprint: 0,
        totalOffsets: 0,
        netFootprint: 0,
      }
    });

    const token = generateAccessToken(user.id, user.role);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      tokenExpiresAt: getTokenExpiry(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.profile?.fullName,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }
    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { profile: true }
    });

    if (!user) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const isValid = await comparePasswords(password, user.passwordHash);
    if (!isValid) {
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }

    const token = generateAccessToken(user.id, user.role);

    res.status(200).json({
      message: 'Logged in successfully',
      token,
      tokenExpiresAt: getTokenExpiry(),
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.profile?.fullName,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  // Stateless JWT — client-side clearance is the primary mechanism.
  // This endpoint exists so frontend can call it cleanly and get a 200.
  // A future refresh-token implementation would also invalidate the refresh token here.
  res.status(200).json({ message: 'Logged out successfully' });
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        profile: true,
        onboarding: true,
        scores: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
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
      onboarding: user.onboarding,
      latestScore: user.scores[0] || null
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
