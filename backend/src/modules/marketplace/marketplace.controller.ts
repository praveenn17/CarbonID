import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';
import { z } from 'zod';

const purchaseSchema = z.object({
  creditsCount: z.number().positive().int(),
});

export const getProjects = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const projects = await prisma.offsetProject.findMany({
      where: { status: 'active' },
      orderBy: { createdAt: 'asc' }
    });
    res.status(200).json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const purchaseOffset = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const id = String(req.params.id);

    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const { creditsCount } = parsed.data;

    const project = await prisma.offsetProject.findUnique({ where: { id } });
    if (!project || project.status !== 'active') {
      res.status(404).json({ message: 'Project not found or inactive' });
      return;
    }

    if (project.availableCredits < creditsCount) {
      res.status(400).json({
        message: `Only ${Math.floor(project.availableCredits)} credits available`,
      });
      return;
    }

    const totalCost = creditsCount * project.pricePerCredit;

    // creditsCount is in tonnes (as shown in UI), convert to kg for passport tracking
    const co2eKg = creditsCount * 1000;

    const result = await prisma.$transaction(async (tx) => {
      // A. Create purchase record
      const purchase = await tx.offsetPurchase.create({
        data: {
          userId,
          projectId: project.id,
          creditsCount,
          totalCost,
          status: 'completed',
        },
        include: { project: { select: { title: true, region: true } } }
      });

      // B. Decrement available credit capacity
      await tx.offsetProject.update({
        where: { id: project.id },
        data: { availableCredits: { decrement: creditsCount } }
      });

      // C. Update Carbon Passport — clamp netFootprint to >= 0
      const currentPassport = await tx.carbonPassport.findUnique({ where: { userId } });
      const currentNet = currentPassport?.netFootprint ?? 0;
      const newNet = Math.max(0, currentNet - co2eKg);
      const currentOffsets = currentPassport?.totalOffsets ?? 0;

      const passport = await tx.carbonPassport.update({
        where: { userId },
        data: {
          totalOffsets: currentOffsets + co2eKg,
          netFootprint: newNet,
        }
      });

      return { purchase, passport };
    });

    res.status(201).json({
      message: 'Purchase successful',
      purchase: result.purchase,
      passport: {
        totalOffsets: result.passport.totalOffsets,
        netFootprint: result.passport.netFootprint,
        carbonGrade: result.passport.carbonGrade,
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const getPurchaseHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const purchases = await prisma.offsetPurchase.findMany({
      where: { userId },
      orderBy: { transactionDate: 'desc' },
      include: {
        project: {
          select: { title: true, region: true, registryType: true, imageUrl: true }
        }
      }
    });

    res.status(200).json(purchases);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
