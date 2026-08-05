import { Router, raw } from 'express';
import { stripe } from '../stripeClient.js';
import { logger } from '../logger.js';
import { fulfillCheckoutSession } from '../services/fulfillment.js';

export const webhookRouter = Router();

webhookRouter.post('/', raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.header('stripe-signature');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error({ err: err.message }, 'invalid webhook signature');
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const result = await fulfillCheckoutSession(event.data.object.id);
        logger.info({ result }, 'fulfilled');
        break;
      }
      case 'invoice.paid':
        logger.info({ id: event.data.object.id }, 'invoice paid');
        break;
      case 'invoice.payment_failed':
        logger.warn({ id: event.data.object.id }, 'invoice payment failed');
        break;
      case 'charge.refunded':
        logger.info({ id: event.data.object.id }, 'refund processed');
        break;
      case 'charge.dispute.created':
        logger.warn({ id: event.data.object.id }, 'DISPUTE opened');
        break;
      default:
        logger.debug({ type: event.type }, 'ignored event');
    }
  } catch (err) {
    logger.error({ err, type: event.type }, 'handler failed');
    return res.status(500).send('handler failure');
  }

  res.json({ received: true });
});
