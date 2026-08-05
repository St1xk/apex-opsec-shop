import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { stripe } from '../stripeClient.js';
import { loadCatalog, getProduct } from '../services/catalog.js';

export const paymentsRouter = Router();

const CheckoutBody = z.object({
  email: z.string().email().optional(),
  items: z.array(z.object({
    product_id: z.string().min(1),
    quantity: z.number().int().positive().max(10).default(1),
  })).min(1).max(20),
});

paymentsRouter.post('/checkout', async (req, res, next) => {
  try {
    const body = CheckoutBody.parse(req.body);
    const idempotencyKey = req.header('x-idempotency-key') || crypto.randomUUID();

    const line_items = [];
    for (const it of body.items) {
      const p = getProduct(it.product_id);
      if (!p) return res.status(400).json({ error: `unknown product: ${it.product_id}` });
      line_items.push({
        quantity: it.quantity,
        price_data: {
          currency: p.currency,
          unit_amount: p.price_cents,
          product_data: {
            name: p.name,
            description: p.description,
            metadata: { product_id: p.id },
          },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: body.email,
      line_items,
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      success_url: `${process.env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.CANCEL_URL,
      payment_intent_data: {
        metadata: { source: 'axiom-shop' },
      },
    }, { idempotencyKey });

    res.json({ id: session.id, url: session.url });
  } catch (err) { next(err); }
});

paymentsRouter.get('/catalog', (_req, res) => {
  res.json(loadCatalog());
});
