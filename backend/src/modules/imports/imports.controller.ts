import { Response } from 'express';
import { parse } from 'csv-parse/sync';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Transport: ['uber', 'lyft', 'ola', 'metro', 'fuel', 'gas', 'shell', 'taxi', 'train', 'bus', 'transit'],
  Food: ['swiggy', 'zomato', 'restaurant', 'cafe', 'doordash', 'starbucks', 'grocery', 'supermarket', 'food', 'dining'],
  Utilities: ['electricity', 'power', 'water', 'utility', 'bill', 'telecom', 'internet', 'broadband', 'wifi'],
  Travel: ['flight', 'airline', 'hotel', 'airbnb', 'booking', 'expedia', 'make my trip', 'mmt', 'irctc'],
  Shopping: ['amazon', 'myntra', 'flipkart', 'shopping', 'apparel', 'zara', 'clothes', 'electronics']
};

// kg CO2e per 1 unit of currency spent
const SPEND_EMISSION_FACTORS: Record<string, number> = {
  Transport: 0.4,
  Food: 0.7,
  Utilities: 1.2,
  Travel: 1.5,
  Shopping: 0.3,
  Other: 0.1
};

export const getHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const transactions = await prisma.importedTransaction.findMany({
      where: { userId },
      orderBy: { date: 'desc' }
    });
    
    res.status(200).json(transactions);
  } catch (error) {
    console.error('[imports.getHistory]', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const processCsv = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    if (!req.file || !req.file.buffer) {
      res.status(400).json({ message: 'No CSV file uploaded' });
      return;
    }

    const csvDataRaw = req.file.buffer.toString('utf-8');
    
    // 1 & 3 & 4. Split lines, trim whitespace, and skip completely empty rows
    const rawLines = csvDataRaw.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
    
    // 2. Detect header row dynamically
    let headerIndex = -1;
    for (let i = 0; i < rawLines.length; i++) {
      const lowerLine = rawLines[i].toLowerCase();
      // Look for common header keywords
      if (lowerLine.includes('date') && (lowerLine.includes('amount') || lowerLine.includes('value') || lowerLine.includes('description'))) {
        headerIndex = i;
        break;
      }
    }

    if (headerIndex === -1) {
      res.status(400).json({ message: 'Failed to parse CSV. Could not detect a valid header row containing Date and Amount/Description.' });
      return;
    }

    const cleanedCsvData = rawLines.slice(headerIndex).join('\n');
    
    // Parse CSV rows into objects using headers
    let records: any[];
    try {
      records = parse(cleanedCsvData, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        // 5. Robustness against malformed row structures
        relax_column_count: true,
        skip_records_with_error: true,
        relax_quotes: true
      });
    } catch (parseError) {
      res.status(400).json({ message: 'Failed to parse CSV. Ensure it has a valid header row.' });
      return;
    }

    if (!records || records.length === 0) {
      res.status(400).json({ message: 'CSV is empty or missing valid rows.' });
      return;
    }

    const processedRows = [];
    const emissionEntriesToCreate = [];
    
    // Fetch user's existing imports to check for duplicates
    const existingTransactions = await prisma.importedTransaction.findMany({
      where: { userId },
      select: { date: true, description: true, amount: true }
    });

    const existingKeys = new Set(existingTransactions.map(tx => 
      `${tx.date.toISOString().split('T')[0]}_${tx.description.toLowerCase().trim()}_${tx.amount.toFixed(2)}`
    ));
    const newKeys = new Set<string>();

    let rowsSkipped = 0;

    for (const row of records) {
      // Flexible mapping for different column names
      const dateStr = row['Date'] || row['date'] || row['Transaction Date'];
      const desc = row['Description'] || row['description'] || row['Name'] || row['Merchant'];
      const amtStr = row['Amount'] || row['amount'] || row['Value'];

      if (!dateStr || !desc || !amtStr) {
        // Skip malformed row
        continue;
      }

      const date = new Date(dateStr);
      let amount = parseFloat(amtStr.replace(/[^0-9.-]+/g,"")); // strip currency symbols

      if (isNaN(amount) || isNaN(date.getTime())) {
        continue;
      }

      // Ensure we only record expenses, not incoming money (for this MVP)
      if (amount <= 0) continue;

      const dateStrKey = date.toISOString().split('T')[0];
      const descKey = desc.toLowerCase().trim();
      const amountKey = amount.toFixed(2);
      const rowKey = `${dateStrKey}_${descKey}_${amountKey}`;

      if (existingKeys.has(rowKey) || newKeys.has(rowKey)) {
        rowsSkipped++;
        continue;
      }
      newKeys.add(rowKey);

      // Classification
      const descLower = desc.toLowerCase();
      let detectedCategory = 'Other';
      
      for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
        if (keywords.some(kw => descLower.includes(kw))) {
          detectedCategory = category;
          break;
        }
      }

      const factor = SPEND_EMISSION_FACTORS[detectedCategory] || SPEND_EMISSION_FACTORS['Other'];
      const estimatedCo2e = amount > 0 ? Number((amount * factor).toFixed(2)) : 0;

      processedRows.push({
        userId,
        date,
        description: desc,
        amount,
        detectedCategory,
        detectedFactor: 'Spend-based MVP',
        estimatedCo2e,
        sourceType: 'CSV'
      });

      if (estimatedCo2e > 0) {
        emissionEntriesToCreate.push({
          userId,
          sourceType: 'imported',
          sourceReference: 'CSV',
          category: detectedCategory,
          activityLabel: desc,
          quantity: amount,
          co2eResult: estimatedCo2e,
          timestamp: date
        });
      }
    }

    if (processedRows.length === 0) {
      res.status(400).json({ message: 'No valid transaction rows found in CSV. Expected "Date", "Description", "Amount".' });
      return;
    }

    // Wrap the insertions in a transaction
    await prisma.$transaction([
      prisma.importedTransaction.createMany({ data: processedRows }),
      prisma.emissionEntry.createMany({ data: emissionEntriesToCreate })
    ]);

    res.status(200).json({
      message: 'Processing complete',
      rowsProcessed: processedRows.length,
      rowsSkipped,
      emissionsGenerated: emissionEntriesToCreate.length
    });

  } catch (error: any) {
    console.error('[imports.processCsv]', error);
    res.status(500).json({ message: 'Internal server error during CSV processing' });
  }
};
