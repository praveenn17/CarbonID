import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // -----------------------------------------------------------------------
  // 1. Emission Categories + Factors (IPCC-derived kg CO2e per unit)
  // -----------------------------------------------------------------------
  const categoryData = [
    {
      name: 'Transport',
      description: 'Vehicle and aviation emissions',
      factors: [
        { name: 'Car (Petrol)',        value: 0.192, unit: 'km'  },
        { name: 'Car (Diesel)',        value: 0.171, unit: 'km'  },
        { name: 'Car (EV)',            value: 0.053, unit: 'km'  },
        { name: 'Bus',                 value: 0.089, unit: 'km'  },
        { name: 'Train',               value: 0.041, unit: 'km'  },
        { name: 'Flight (short-haul)', value: 0.255, unit: 'km'  },
        { name: 'Flight (long-haul)',  value: 0.195, unit: 'km'  },
      ]
    },
    {
      name: 'Food',
      description: 'Diet and food production emissions',
      factors: [
        { name: 'Beef',       value: 27.0, unit: 'kg' },
        { name: 'Lamb',       value: 39.2, unit: 'kg' },
        { name: 'Pork',       value: 12.1, unit: 'kg' },
        { name: 'Chicken',    value: 6.9,  unit: 'kg' },
        { name: 'Fish',       value: 6.1,  unit: 'kg' },
        { name: 'Dairy',      value: 3.2,  unit: 'kg' },
        { name: 'Vegetables', value: 2.0,  unit: 'kg' },
        { name: 'Grains',     value: 1.4,  unit: 'kg' },
      ]
    },
    {
      name: 'Utilities',
      description: 'Electricity, gas, and home energy',
      factors: [
        { name: 'Electricity (grid avg)', value: 0.82, unit: 'kWh' },
        { name: 'Natural Gas',            value: 2.04, unit: 'kWh' },
        { name: 'Heating Oil',            value: 2.54, unit: 'litre' },
        { name: 'Solar (self-generated)', value: 0.05, unit: 'kWh' },
      ]
    },
    {
      name: 'Travel',
      description: 'Long-distance and holiday travel',
      factors: [
        { name: 'Hotel stay (night)', value: 31.5, unit: 'night' },
        { name: 'Cruise ship (day)',  value: 400.0,unit: 'day'   },
      ]
    },
  ];

  for (const cat of categoryData) {
    const category = await prisma.emissionCategory.upsert({
      where: { name: cat.name },
      update: { description: cat.description },
      create: { name: cat.name, description: cat.description },
    });

    for (const f of cat.factors) {
      // Upsert factors by name+categoryId — safe to re-run
      const existing = await prisma.emissionFactor.findFirst({
        where: { categoryId: category.id, name: f.name }
      });
      if (!existing) {
        await prisma.emissionFactor.create({
          data: { categoryId: category.id, name: f.name, value: f.value, unit: f.unit }
        });
      }
    }
  }
  console.log('✅ Emission categories and factors seeded');

  // -----------------------------------------------------------------------
  // 2. Offset Projects (idempotent — only create if title doesn't exist)
  // -----------------------------------------------------------------------
  const projects = [
    {
      title: 'Amazon Reforestation Initiative',
      description: 'Restores degraded land in the Amazon basin through native tree planting, supporting local biodiversity and communities.',
      region: 'Brazil',
      registryType: 'Verra',
      verificationBadge: 'Verified Carbon Standard',
      pricePerCredit: 12.50,
      availableCredits: 12500,
      imageUrl: 'https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?q=80&w=600&auto=format&fit=crop',
      status: 'active'
    },
    {
      title: 'Clean Cookstoves Deployment',
      description: 'Provides efficient biomass cookstoves to rural families, reducing smoke inhalation and halting deforestation.',
      region: 'Kenya',
      registryType: 'Gold Standard',
      verificationBadge: 'GS4GG',
      pricePerCredit: 8.75,
      availableCredits: 8400,
      imageUrl: 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?q=80&w=600&auto=format&fit=crop',
      status: 'active'
    },
    {
      title: 'Solar Microgrids for Villages',
      description: 'Replaces diesel generators with solar microgrids, empowering off-grid communities with sustainable energy.',
      region: 'India',
      registryType: 'Gold Standard',
      verificationBadge: 'GS4GG',
      pricePerCredit: 15.00,
      availableCredits: 4200,
      imageUrl: 'https://images.unsplash.com/photo-1509391366360-1e97f52cefd3?q=80&w=600&auto=format&fit=crop',
      status: 'active'
    }
  ];

  for (const p of projects) {
    const existing = await prisma.offsetProject.findFirst({ where: { title: p.title } });
    if (!existing) {
      await prisma.offsetProject.create({ data: p });
    }
  }
  console.log('✅ Offset projects seeded');
  console.log('🎉 Seed complete.');
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (e) => { console.error(e); await prisma.$disconnect(); });
