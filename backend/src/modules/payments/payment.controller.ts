import { Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import prisma from '../../db';
import { AuthRequest } from '../../middleware/auth';
import { z } from 'zod';

// ── SDK instance (lazy — only fails at request time if keys are missing) ────
const getRazorpay = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) {
    throw new Error('Razorpay keys are not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env');
  }
  return new Razorpay({ key_id, key_secret });
};

// INR conversion: treat pricePerCredit as USD, convert at a fixed MVP rate.
// In production, replace with a live FX API.
const USD_TO_INR = Number(process.env.USD_TO_INR_RATE ?? 83);

// ── Shared: complete the offset purchase inside a DB transaction ─────────────
// Called ONLY after payment is verified — never directly from user input.
async function completePurchase(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  projectId: string,
  creditsCount: number,
  paymentOrderId: string,
  totalCostUSD: number,
) {
  const project = await tx.offsetProject.findUnique({ where: { id: projectId } });
  if (!project || project.status !== 'active') throw new Error('Project not found or inactive');
  if (project.availableCredits < creditsCount) throw new Error('Insufficient credits remaining');

  // A. Record the purchase
  const purchase = await tx.offsetPurchase.create({
    data: {
      userId,
      projectId,
      creditsCount,
      totalCost: totalCostUSD,
      status: 'completed',
      paymentOrderId,
    },
    include: { project: { select: { title: true, region: true } } },
  });

  // B. Decrement project credit pool
  await tx.offsetProject.update({
    where: { id: projectId },
    data: { availableCredits: { decrement: creditsCount } },
  });

  // C. Update passport — creditsCount is in tonnes → convert to kg
  const co2eKg = creditsCount * 1000;
  const currentPassport = await tx.carbonPassport.findUnique({ where: { userId } });
  const currentOffsets = currentPassport?.totalOffsets ?? 0;
  const currentNet = currentPassport?.netFootprint ?? 0;

  await tx.carbonPassport.update({
    where: { userId },
    data: {
      totalOffsets: currentOffsets + co2eKg,
      netFootprint: Math.max(0, currentNet - co2eKg),
    },
  });

  return purchase;
}

// ── POST /api/payments/create-order ─────────────────────────────────────────
const createOrderSchema = z.object({
  projectId: z.string().uuid(),
  creditsCount: z.number().int().positive(),
});

export const createOrder = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const parsed = createOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const { projectId, creditsCount } = parsed.data;

    const project = await prisma.offsetProject.findUnique({ where: { id: projectId } });
    if (!project || project.status !== 'active') {
      res.status(404).json({ message: 'Project not found or inactive' });
      return;
    }
    if (project.availableCredits < creditsCount) {
      res.status(400).json({ message: `Only ${Math.floor(project.availableCredits)} credits available` });
      return;
    }

    const totalUSD = creditsCount * project.pricePerCredit;
    // Convert to INR paise (smallest currency unit) — integer required by Razorpay
    const amountPaise = Math.round(totalUSD * USD_TO_INR * 100);

    if (amountPaise < 100) {
      res.status(400).json({ message: 'Order amount too small (minimum ₹1)' });
      return;
    }

    const rzp = getRazorpay();
    const rzpOrder = await rzp.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `carbonid_${Date.now()}`,
      notes: { userId, projectId, creditsCount: String(creditsCount) },
    });

    // Persist the order in our DB before sending to frontend
    const paymentOrder = await prisma.paymentOrder.create({
      data: {
        userId,
        projectId,
        creditsCount,
        amountPaise,
        currency: 'INR',
        razorpayOrderId: rzpOrder.id,
        status: 'pending',
      },
    });

    res.status(201).json({
      paymentOrderId: paymentOrder.id,
      razorpayOrderId: rzpOrder.id,
      amountPaise,
      currency: 'INR',
      totalUSD,
      keyId: process.env.RAZORPAY_KEY_ID,
      projectTitle: project.title,
      creditsCount,
    });
  } catch (error: any) {
    console.error('[createOrder]', error);
    // Distinguish Razorpay API errors from config errors
    if (error.message?.includes('Razorpay keys')) {
      res.status(503).json({ message: error.message });
    } else {
      res.status(500).json({ message: 'Could not create payment order' });
    }
  }
};

// ── POST /api/payments/verify ────────────────────────────────────────────────
const verifySchema = z.object({
  paymentOrderId:    z.string().uuid(),
  razorpayOrderId:   z.string(),
  razorpayPaymentId: z.string(),
  razorpaySignature: z.string(),
});

export const verifyPayment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Invalid input', errors: parsed.error.issues });
      return;
    }

    const { paymentOrderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = parsed.data;

    // 1. Load the DB order and make sure it belongs to this user
    const paymentOrder = await prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    if (!paymentOrder || paymentOrder.userId !== userId) {
      res.status(404).json({ message: 'Payment order not found' });
      return;
    }
    if (paymentOrder.status === 'success') {
      res.status(409).json({ message: 'Payment already processed' });
      return;
    }
    if (paymentOrder.status === 'failed') {
      res.status(400).json({ message: 'Payment was marked as failed. Please start a new order.' });
      return;
    }

    // 2. HMAC-SHA256 signature verification — the core security check
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) { res.status(503).json({ message: 'Payment service not configured' }); return; }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      // Mark as failed — prevents retry with same (tampered) data
      await prisma.paymentOrder.update({
        where: { id: paymentOrderId },
        data: { status: 'failed', razorpayPaymentId, razorpaySignature },
      });
      res.status(400).json({ message: 'Payment signature verification failed' });
      return;
    }

    // 3. Signature valid — run atomic purchase + passport update
    const purchase = await prisma.$transaction(async (tx) => {
      // Update order record first
      await tx.paymentOrder.update({
        where: { id: paymentOrderId },
        data: { status: 'success', razorpayPaymentId, razorpaySignature },
      });

      return completePurchase(
        tx,
        userId,
        paymentOrder.projectId,
        paymentOrder.creditsCount,
        paymentOrderId,
        (paymentOrder.amountPaise / 100) / USD_TO_INR, // back to USD for receipt
      );
    });

    res.status(201).json({
      message: 'Payment verified and offset purchase complete',
      purchase: {
        id: purchase.id,
        creditsCount: purchase.creditsCount,
        totalCost: purchase.totalCost,
        projectTitle: (purchase as any).project?.title,
        projectRegion: (purchase as any).project?.region,
      },
    });
  } catch (error: any) {
    console.error('[verifyPayment]', error);
    res.status(500).json({ message: error.message || 'Payment verification failed' });
  }
};

// ── POST /api/payments/webhook ───────────────────────────────────────────────
// Razorpay sends raw body — must be parsed as Buffer (see index.ts)
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  try {
    const signature = req.headers['x-razorpay-signature'] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      // Secret not configured — acknowledge but don't process
      console.warn('[webhook] RAZORPAY_WEBHOOK_SECRET not set — skipping verification');
      res.status(200).json({ received: true });
      return;
    }

    // Verify webhook authenticity
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(req.body as Buffer)
      .digest('hex');

    if (expectedSig !== signature) {
      res.status(400).json({ message: 'Invalid webhook signature' });
      return;
    }

    const event = JSON.parse((req.body as Buffer).toString('utf-8'));
    const eventType: string = event.event;
    const payment = event.payload?.payment?.entity;

    if (!payment) { res.status(200).json({ received: true }); return; }

    const rzpOrderId: string = payment.order_id;
    const rzpPaymentId: string = payment.id;

    if (eventType === 'payment.captured') {
      // Idempotent: only update if still pending
      const existing = await prisma.paymentOrder.findUnique({
        where: { razorpayOrderId: rzpOrderId },
      });
      if (existing && existing.status === 'pending') {
        await prisma.paymentOrder.update({
          where: { razorpayOrderId: rzpOrderId },
          data: { status: 'success', razorpayPaymentId: rzpPaymentId },
        });
        console.log(`[webhook] payment.captured → order ${rzpOrderId} marked success`);
      }
    }

    if (eventType === 'payment.failed') {
      const existing = await prisma.paymentOrder.findUnique({
        where: { razorpayOrderId: rzpOrderId },
      });
      if (existing && existing.status === 'pending') {
        await prisma.paymentOrder.update({
          where: { razorpayOrderId: rzpOrderId },
          data: { status: 'failed', razorpayPaymentId: rzpPaymentId },
        });
        console.log(`[webhook] payment.failed → order ${rzpOrderId} marked failed`);
      }
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('[webhook error]', error);
    // Always return 200 so Razorpay doesn't retry indefinitely
    res.status(200).json({ received: true });
  }
};

// ── GET /api/payments/orders ────────────────────────────────────────────────
// Lists all pending, success, and failed payment attempts for the user
export const getOrders = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const orders = await prisma.paymentOrder.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        project: { select: { title: true, region: true } }
      }
    });

    res.status(200).json(orders);
  } catch (error) {
    console.error('[getOrders]', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// ── POST /api/payments/fail ──────────────────────────────────────────────────
// Allows the frontend to immediately record a failure from the checkout modal
// This helps UX and logging, even if the webhook also fires later.
export const markOrderFailed = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const { paymentOrderId, errorData } = req.body;
    if (!paymentOrderId) { res.status(400).json({ message: 'Payment order ID required' }); return; }

    const order = await prisma.paymentOrder.findUnique({ where: { id: paymentOrderId } });
    if (!order || order.userId !== userId) { res.status(404).json({ message: 'Order not found' }); return; }

    if (order.status === 'pending') {
      await prisma.paymentOrder.update({
        where: { id: paymentOrderId },
        data: { status: 'failed' }
      });
      console.warn(`[frontend-fail] User ${userId} payment failed for order ${order.razorpayOrderId}. Reason:`, errorData);
    }
    
    res.status(200).json({ message: 'Failure logged' });
  } catch (error) {
    console.error('[markOrderFailed]', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

// ── GET /api/payments/:orderId/receipt ───────────────────────────────────────
export const downloadReceipt = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    if (!userId) { res.status(401).json({ message: 'Unauthorized' }); return; }

    const orderId = String(req.params.orderId);
    
    // Fetch order with related user, profile, and project details
    const order = await prisma.paymentOrder.findUnique({
      where: { id: orderId },
      include: {
        user: { include: { profile: true } },
        project: true
      }
    });

    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    
    // We assert the types here briefly because Prisma generic inference can fail if the where clause was loose earlier
    const user = order.user;
    const project = order.project;


    if (!order) { res.status(404).json({ message: 'Order not found' }); return; }
    if (order.userId !== userId) { res.status(403).json({ message: 'Forbidden' }); return; }
    if (order.status !== 'success') {
      res.status(400).json({ message: 'Receipts are only available for successful payments.' });
      return;
    }

    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=CarbonID_Receipt_${order.razorpayOrderId}.pdf`);

    // Create PDF document
    const doc = new PDFDocument({ margin: 50 });
    
    // Stream directly to response
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('CarbonID', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Official Carbon Offset Receipt', { align: 'center' });
    doc.moveDown(2);

    // Receipt details
    doc.fontSize(14).font('Helvetica-Bold').text('Receipt Details');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Receipt Number: REC-${order.id.split('-')[0].toUpperCase()}`);
    doc.text(`Date: ${new Date(order.updatedAt).toLocaleString()}`);
    doc.text(`Order ID: ${order.razorpayOrderId}`);
    doc.text(`Payment ID: ${order.razorpayPaymentId}`);
    doc.text(`Status: SUCCESS`);
    doc.moveDown(1.5);

    // Customer details
    const customerName = user.profile?.fullName || 'Valued Customer';
    const customerEmail = user.email;
    
    // Left column: Customer, Right column: Project
    const startY = doc.y;
    
    doc.fontSize(12).font('Helvetica-Bold').text('Customer Details', 50, startY);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${customerName}`, 50, startY + 15);
    doc.text(`Email: ${customerEmail}`, 50, startY + 30);

    doc.fontSize(12).font('Helvetica-Bold').text('Project Details', 300, startY);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${project.title}`, 300, startY + 15);
    doc.text(`Region: ${project.region}`, 300, startY + 30);
    
    doc.moveDown(4);

    // Purchase summary table
    doc.y = startY + 70;
    doc.fontSize(14).font('Helvetica-Bold').text('Purchase Summary', 50, doc.y);
    doc.moveDown(0.5);

    // Table Header
    const tableTop = doc.y;
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Description', 50, tableTop);
    doc.text('Quantity (tonnes)', 300, tableTop);
    doc.text('Amount', 450, tableTop);
    
    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    // Table Row
    const rowY = tableTop + 25;
    doc.font('Helvetica');
    doc.text(`Carbon Offset: ${project.title}`, 50, rowY, { width: 240 });
    doc.text(`${order.creditsCount}`, 300, rowY);
    
    const amountFloat = order.amountPaise / 100;
    doc.text(`${order.currency} ${amountFloat.toFixed(2)}`, 450, rowY);

    doc.moveTo(50, rowY + 30).lineTo(550, rowY + 30).stroke();

    // Total
    const totalY = rowY + 40;
    doc.font('Helvetica-Bold');
    doc.text('Total Paid:', 300, totalY);
    doc.text(`${order.currency} ${amountFloat.toFixed(2)}`, 450, totalY);
    
    // Offset impact message
    doc.moveDown(4);
    doc.fontSize(12).font('Helvetica-Oblique').fillColor('#10b981');
    doc.text(`Thank you for neutralizing ${order.creditsCount * 1000} kg of CO2e!`, { align: 'center' });
    
    // Footer
    doc.fillColor('black');
    doc.fontSize(8).font('Helvetica');
    // Position footer at bottom
    const bottomPos = doc.page.height - 80;
    doc.text('Issued by CarbonID', 50, bottomPos, { align: 'center' });
    doc.text('Platform by Praveen Kumar', { align: 'center' });
    doc.text('This is a system-generated receipt.', { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('[downloadReceipt]', error);
    // Note: If headers are already sent, this might crash, but PDF generation
    // is synchronous setup, shouldn't throw late usually unless pipe breaks.
    if (!res.headersSent) {
      res.status(500).json({ message: 'Internal Server Error' });
    }
  }
};
