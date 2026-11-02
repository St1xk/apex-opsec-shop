import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import 'dotenv/config';

import { logger } from './logger.js';
import { paymentsRouter } from './routes/payments.js';
import { webhookRouter } from './routes/webhook.js';
import { ordersRouter, downloadRouter } from './routes/orders.js';
import { adminRouter } from './routes/admin.js';
import { pagesRouter } from './routes/pages.js';
import { supportRouter } from './routes/support.js';

const app = express();

app.use('/webhook', webhookRouter);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      frameSrc: ["https://js.stripe.com", "https://checkout.stripe.com"],
    },
  },
}));
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_, res) => res.json({ ok: true }));
app.use('/payments', paymentsRouter);
app.use('/orders', ordersRouter);
app.use('/download', downloadRouter);
app.use('/admin', adminRouter);
app.use('/support', supportRouter);
app.use('/', pagesRouter);

app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'request failed');
  if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
  if (err.type?.startsWith?.('Stripe')) return res.status(err.statusCode || 502).json({ error: err.message, code: err.code });
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT) || 4242;
app.listen(port, () => logger.info({ port }, 'stripe-shop up'));
