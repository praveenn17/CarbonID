import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

// Import Modular Routes
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import onboardingRoutes from './modules/onboarding/onboarding.routes';
import emissionsRoutes from './modules/emissions/emissions.routes';
import scoreRoutes from './modules/carbon-score/score.routes';
import marketplaceRoutes from './modules/marketplace/marketplace.routes';
import passportRoutes from './modules/passport/passport.routes';
import paymentRoutes from './modules/payments/payment.routes';
import insightsRoutes from './modules/insights/insights.routes';
import importsRoutes from './modules/imports/imports.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middleware Setup
app.use(helmet()); // Sets various HTTP headers for security
app.use(compression()); // Compress all responses
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
}));

// Raw body for Razorpay webhook — must be BEFORE express.json()
// Razorpay signs the raw request body; parsing it first breaks HMAC verification
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' })); // Body parser with reasonable limit

// Logging - clean in dev, standard in prod
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Core API Routing
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/emissions', emissionsRoutes);
app.use('/api/carbon-score', scoreRoutes);
app.use('/api/projects', marketplaceRoutes);
app.use('/api/passport', passportRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/insights', insightsRoutes);
app.use('/api/imports', importsRoutes);

// Robust Health Check Endpoint (useful for Docker/Orchestrators)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

// Centralized Error Handling Middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[Error Handler] ${err.name}: ${err.message}`);
  
  if (process.env.NODE_ENV === 'development') {
    console.error(err.stack);
  }

  res.status(err.status || 500).json({
    message: err.message || 'Internal Server Error',
    // Only send stack trace in development
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
