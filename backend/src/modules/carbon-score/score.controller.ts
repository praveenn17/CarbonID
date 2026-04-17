import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';

/**
 * Grade thresholds (annual kg CO2e).
 * Global average ~7,000 kg. UK/EU target ~2,000 kg for 1.5°C.
 * A+ < 1500 | A < 2500 | B < 4000 | C < 6000 | D < 9000 | F ≥ 9000
 * Exported so onboarding.controller.ts can share the same thresholds.
 */
export function computeGrade(annualKg: number): string {
  if (annualKg < 1500) return 'A+';
  if (annualKg < 2500) return 'A';
  if (annualKg < 4000) return 'B';
  if (annualKg < 6000) return 'C';
  if (annualKg < 9000) return 'D';
  return 'F';
}

export const getCurrentScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const score = await prisma.carbonScore.findFirst({
      where: { userId, month: currentMonth, year: currentYear },
      orderBy: { createdAt: 'desc' }
    });

    if (!score) {
      res.status(200).json({ status: 'no_data', message: 'No score calculated for this month', monthlyScore: 0, annualEstimate: 0 });
      return;
    }

    res.status(200).json(score);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getScoreHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const scores = await prisma.carbonScore.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'desc' }],
      take: 24
    });

    // Deduplicate: one row per year/month, chronological, max 12
    const seen = new Set<string>();
    const deduped = scores.filter(s => {
      const key = `${s.year}-${s.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12).reverse();

    res.status(200).json(deduped);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const recalculateScore = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    // 1. Get onboarding baseline (monthly slice)
    const onboarding = await prisma.onboardingResponse.findUnique({ where: { userId } });
    const baselineMonthly = onboarding ? onboarding.baselineAnnualCo2e / 12 : 500;

    // 2. Sum all manual entries logged this calendar month
    const currentDate = new Date();
    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    const monthlyEmissions = await prisma.emissionEntry.findMany({
      where: { userId, timestamp: { gte: startOfMonth } }
    });
    const additionalEmissions = monthlyEmissions.reduce((acc, e) => acc + e.co2eResult, 0);

    // 3. Compute final scores
    const monthlyScore = baselineMonthly + additionalEmissions;
    const annualEstimate = monthlyScore * 12;
    const carbonGrade = computeGrade(annualEstimate);

    // 4. Write score snapshot (one per recalculation — deduped on read)
    const newScore = await prisma.carbonScore.create({
      data: {
        userId,
        scoreMode: 'transaction-derived',
        monthlyScore,
        annualEstimate,
        month: currentDate.getMonth() + 1,
        year: currentDate.getFullYear()
      }
    });

    // 5. Sync passport fields
    //    cumulativeFootprint = (baseline/month × months active) + all ever-logged entries
    //    totalOffsets — untouched here; only purchaseOffset modifies it
    //    netFootprint = max(0, cumulative - offsets)
    const allEmissions = await prisma.emissionEntry.findMany({ where: { userId } });
    const totalLogged = allEmissions.reduce((acc, e) => acc + e.co2eResult, 0);

    const monthsActive = Math.max(1, onboarding
      ? Math.ceil((currentDate.getTime() - new Date(onboarding.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 30))
      : 1);
    const cumulativeFootprint = (baselineMonthly * monthsActive) + totalLogged;

    // Fetch current offsets separately — avoids nested-await inside update data
    const currentPassport = await prisma.carbonPassport.findUnique({
      where: { userId },
      select: { totalOffsets: true }
    });
    const currentOffsets = currentPassport?.totalOffsets ?? 0;
    const netFootprint = Math.max(0, cumulativeFootprint - currentOffsets);

    const passport = await prisma.carbonPassport.update({
      where: { userId },
      data: { cumulativeFootprint, netFootprint, carbonGrade }
    });

    res.status(200).json({ message: 'Score recalculated', score: newScore, passport });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
