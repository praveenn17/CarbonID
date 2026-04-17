import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';
import { z } from 'zod';

const manualEmissionSchema = z.object({
  category: z.string(),        // e.g. "Transport"
  activityLabel: z.string(),   // e.g. "Car (Petrol)"
  quantity: z.number().positive(),
  factorId: z.string().optional(), // explicit override
});

/**
 * Resolves co2e:
 * 1. If caller provides an explicit factorId → use it
 * 2. Otherwise look up the factor by activityLabel within the given category
 * 3. Fallback: 2.3 kg/unit (preserved so unknown activities still work)
 */
async function resolveCo2e(
  category: string,
  activityLabel: string,
  quantity: number,
  factorId?: string
): Promise<{ co2eResult: number; factorUsed: string }> {
  if (factorId) {
    const factor = await prisma.emissionFactor.findUnique({ where: { id: factorId } });
    if (factor) {
      return { co2eResult: quantity * factor.value, factorUsed: factor.name };
    }
  }

  // Look up by name inside category (case-insensitive partial match)
  const categoryRow = await prisma.emissionCategory.findFirst({
    where: { name: { equals: category } }
  });

  if (categoryRow) {
    const factor = await prisma.emissionFactor.findFirst({
      where: {
        categoryId: categoryRow.id,
        name: { contains: activityLabel }
      }
    });
    if (factor) {
      return { co2eResult: quantity * factor.value, factorUsed: factor.name };
    }
  }

  // Generic fallback (2.3 kg CO2e per unit)
  return { co2eResult: quantity * 2.3, factorUsed: 'generic-fallback' };
}

export const logManualEmission = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const parsed = manualEmissionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const { category, activityLabel, quantity, factorId } = parsed.data;
    const { co2eResult, factorUsed } = await resolveCo2e(category, activityLabel, quantity, factorId);

    const entry = await prisma.emissionEntry.create({
      data: {
        userId,
        sourceType: 'manual',
        category,
        activityLabel,
        quantity,
        co2eResult,
        timestamp: new Date(),
      }
    });

    res.status(201).json({ message: 'Emission logged successfully', entry, factorUsed });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getEmissions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const entries = await prisma.emissionEntry.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    res.status(200).json(entries);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getEmissionSummary = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const entries = await prisma.emissionEntry.findMany({ where: { userId } });

    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const e of entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.co2eResult;
      total += e.co2eResult;
    }

    // Return sorted array for easy chart consumption
    const breakdown = Object.entries(byCategory)
      .map(([category, value]) => ({ category, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value);

    res.status(200).json({ total: Math.round(total), breakdown });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

/** Return available categories + their factors for the frontend form */
export const getFactors = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const categories = await prisma.emissionCategory.findMany({
      include: { factors: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' }
    });
    res.status(200).json(categories);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
