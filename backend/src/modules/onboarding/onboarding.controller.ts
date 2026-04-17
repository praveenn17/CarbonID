import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';
import { z } from 'zod';

/** Mirrors score.controller.ts — keep in sync */
function computeGrade(annualKg: number): string {
  if (annualKg < 1500) return 'A+';
  if (annualKg < 2500) return 'A';
  if (annualKg < 4000) return 'B';
  if (annualKg < 6000) return 'C';
  if (annualKg < 9000) return 'D';
  return 'F';
}

const onboardingSchema = z.object({
  country: z.string(),
  lifestylePreference: z.string(),
  transportHabits: z.string(),
  electricityEstimate: z.number().nonnegative(),
  dietPreference: z.string(),
  travelFrequency: z.string(),
});

// A simple deterministic mock calculation engine for the MVP
const calculateBaseline = (data: z.infer<typeof onboardingSchema>): number => {
  let base = 5000; // Baseline 5000 kg CO2e
  
  if (data.dietPreference === 'Vegan') base -= 1000;
  else if (data.dietPreference === 'Omnivore') base += 2000;

  if (data.transportHabits.includes('Car')) base += 3000;
  if (data.travelFrequency === 'Frequent') base += 4000;

  base += data.electricityEstimate * 1.5; // Arbitrary 1.5 multiplier for MVP
  
  return base;
};

export const submitOnboarding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const parsed = onboardingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const baselineAnnualCo2e = calculateBaseline(parsed.data);
    const baselineMonthly = baselineAnnualCo2e / 12;
    const carbonGrade = computeGrade(baselineAnnualCo2e);

    const onboarding = await prisma.onboardingResponse.upsert({
      where: { userId },
      update: {
        ...parsed.data,
        baselineAnnualCo2e,
      },
      create: {
        userId,
        ...parsed.data,
        baselineAnnualCo2e,
      },
    });

    // Read current offsets BEFORE touching the passport so they are never lost
    const existingPassport = await prisma.carbonPassport.findUnique({
      where: { userId },
      select: { totalOffsets: true },
    });
    const existingOffsets = existingPassport?.totalOffsets ?? 0;
    // netFootprint must account for offsets the user already purchased
    const newNetFootprint = Math.max(0, baselineMonthly - existingOffsets);

    // Upsert passport — preserves totalOffsets on update, never resets it
    await prisma.carbonPassport.upsert({
      where: { userId },
      update: {
        cumulativeFootprint: baselineMonthly,
        netFootprint: newNetFootprint,
        carbonGrade,
      },
      create: {
        userId,
        carbonGrade,
        cumulativeFootprint: baselineMonthly,
        totalOffsets: 0,
        netFootprint: baselineMonthly,
      }
    });

    res.status(200).json({ message: 'Onboarding completed successfully', onboarding });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getOnboarding = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    const onboarding = await prisma.onboardingResponse.findUnique({
      where: { userId }
    });

    if (!onboarding) {
      res.status(404).json({ message: 'Onboarding not completed yet' });
      return;
    }

    res.status(200).json(onboarding);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
