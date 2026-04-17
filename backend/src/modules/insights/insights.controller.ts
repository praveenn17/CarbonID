import { Response } from 'express';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';

export const generateInsights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }

    // 1. Fetch relevant data
    const passport = await prisma.carbonPassport.findUnique({ where: { userId } });
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentEmissions = await prisma.emissionEntry.findMany({
      where: { userId, timestamp: { gte: thirtyDaysAgo } }
    });
    
    // Sort scores descending by year and month
    const scores = await prisma.carbonScore.findMany({
      where: { userId },
      orderBy: [ { year: 'desc' }, { month: 'desc' } ],
      take: 2 // get current and previous
    });

    // 2. Compute Top Emission Sources
    const categoryTotals: Record<string, number> = {};
    for (const e of recentEmissions) {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.co2eResult;
    }
    const sortedCategories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
    const topSource = sortedCategories.length > 0 ? {
      category: sortedCategories[0][0],
      amount: sortedCategories[0][1]
    } : null;

    // 3. Compute Trend (Why footprint increased or decreased)
    let trend = 'Neutral';
    let trendPercentage = 0;
    let trendReason = 'Your footprint has been stable recently.';

    if (scores.length >= 2) {
      const current = scores[0].monthlyScore;
      const prev = scores[1].monthlyScore;
      if (prev > 0) {
        trendPercentage = ((current - prev) / prev) * 100;
        if (trendPercentage > 5) {
          trend = 'Increased';
          trendReason = `Your footprint increased by ${trendPercentage.toFixed(1)}% compared to last month.`;
          if (topSource) {
            trendReason += ` High emissions in ${topSource.category} were the primary driver.`;
          }
        } else if (trendPercentage < -5) {
          trend = 'Decreased';
          trendReason = `Great job! Your footprint decreased by ${Math.abs(trendPercentage).toFixed(1)}% compared to last month.`;
        }
      }
    }

    // 4. Recommended Actions
    let recommendedAction = "Log more activities to get personalized recommendations.";
    if (topSource) {
      switch(topSource.category) {
        case 'Transport':
          recommendedAction = "Transport is your highest emission source. Consider switching to public transit or carpooling twice a week to drastically cut your footprint.";
          break;
        case 'Food':
          recommendedAction = "Dietary choices strongly impact your score. Try substituting one red meat meal with a plant-based alternative each week.";
          break;
        case 'Utilities':
          recommendedAction = "Home energy usage is high. Upgrading to LED bulbs, adjusting your thermostat, and unplugging idle devices can yield significant reductions.";
          break;
        case 'Travel':
          recommendedAction = "Air travel produces massive emissions quickly. Try opting for direct flights or replacing short trips with video conferencing or train travel.";
          break;
        default:
          recommendedAction = "Look for incremental ways to reduce activities in your top category.";
      }
    }

    // 5. Recommended Offset Amount
    const netFootprint = passport?.netFootprint || 0;
    // We recommend offsetting the whole net footprint, converted to tonnes minimum 1
    const rawTonnes = netFootprint / 1000;
    const recommendedOffsetTonnes = rawTonnes > 0 ? Math.max(1, Math.round(rawTonnes)) : 0;

    // 6. Short Climate Summary
    const summary = topSource 
      ? `You have a net footprint of ${Math.round(netFootprint)} kg CO2e. Your primary challenge is ${topSource.category}, contributing largely to your recent emissions.`
      : `You have a net footprint of ${Math.round(netFootprint)} kg CO2e. Log your daily activities to uncover patterns and receive dynamic AI recommendations.`;

    // Construct "LLM-Ready" JSON Response
    const insightData = {
      topSource,
      trend: {
        direction: trend,
        percentage: Math.abs(trendPercentage),
        reason: trendReason
      },
      recommendedAction,
      recommendedOffsetTonnes,
      summary
    };

    res.status(200).json(insightData);
  } catch (error) {
    console.error('[generateInsights]', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};
