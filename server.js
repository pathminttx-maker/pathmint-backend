require('dotenv').config();
const express = require('express');
const cors = require('cors');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 5000;

// CORS configuration for production
const allowedOrigins = [
  'https://pathmint.app',
  'https://www.pathmint.app',
  'http://localhost:3000',
  'http://localhost:19000',
  'http://localhost:19001',
  'exp://localhost:19000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Create payment intent endpoint
app.post('/create-payment-intent', async (req, res) => {
  try {
    const { planId, userEmail, amount } = req.body;

    // Validate inputs
    if (!planId || !userEmail || !amount) {
      return res.status(400).json({ error: 'Missing required fields: planId, userEmail, amount' });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: 'usd',
      description: `Pathmint subscription upgrade - Plan: ${planId}`,
      receipt_email: userEmail,
      metadata: {
        planId: planId,
        userEmail: userEmail,
        environment: process.env.NODE_ENV || 'development'
      }
    });

    res.status(200).json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount,
      currency: 'usd'
    });
  } catch (error) {
    console.error('Payment Intent Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Retrieve payment intent endpoint
app.get('/payment-intent/:intentId', async (req, res) => {
  try {
    const { intentId } = req.params;
    const paymentIntent = await stripe.paymentIntents.retrieve(intentId);
    res.status(200).json(paymentIntent);
  } catch (error) {
    console.error('Retrieve Payment Intent Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Webhook endpoint for Stripe events (future use)
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('Payment succeeded:', event.data.object.id);
        break;
      case 'payment_intent.payment_failed':
        console.log('Payment failed:', event.data.object.id);
        break;
      default:
        console.log('Unhandled event type:', event.type);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook Error:', error.message);
    res.status(400).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Pathmint backend server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
