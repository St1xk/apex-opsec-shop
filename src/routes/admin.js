import { Router } from 'express';
import { stmts } from '../services/db.js';

export const adminRouter = Router();

adminRouter.use((req, res, next) => {
  const token = req.header('x-admin-token') || req.query.token;
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

adminRouter.get('/orders', (_req, res) => {
  const orders = stmts.listAllOrders.all();
  const enriched = orders.map(o => ({
    ...o,
    items: stmts.getOrderItems.all(o.id),
  }));
  res.json({ orders: enriched });
});
