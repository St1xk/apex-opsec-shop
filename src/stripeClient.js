import Stripe from 'stripe';
import 'dotenv/config';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY missing');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-11-20.acacia',
  maxNetworkRetries: 3,
  timeout: 20_000,
  telemetry: false,
  appInfo: { name: 'axiom-shop', version: '1.0.0' },
});
