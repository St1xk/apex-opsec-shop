import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { db, stmts } from '../services/db.js';
import { fulfillCheckoutSession, issueFreshDownloadToken } from '../services/fulfillment.js';
import { productFilePath } from '../services/catalog.js';

export const ordersRouter = Router();

const getItemById = db.prepare('SELECT * FROM order_items WHERE id = ?');

ordersRouter.get('/session/:id', async (req, res, next) => {
  try {
    const result = await fulfillCheckoutSession(req.params.id);
    if (result.skipped) return res.status(409).json({ error: 'payment not completed' });
    const items = stmts.getOrderItems.all(result.order_id).map(i => ({
      product_name: i.product_name,
      license_key: i.license_key,
      redirect_url: i.redirect_url,
      download_url: i.download_file ? `/download/${issueFreshDownloadToken(i.id)}` : null,
    }));
    res.json({ order_id: result.order_id, items });
  } catch (err) { next(err); }
});

const LookupBody = z.object({ email: z.string().email() });

ordersRouter.post('/lookup', (req, res, next) => {
  try {
    const { email } = LookupBody.parse(req.body);
    const orders = stmts.getCustomerOrders.all(email);
    const result = orders.map(o => {
      const items = stmts.getOrderItems.all(o.id).map(i => ({
        product_name: i.product_name,
        license_key: i.license_key,
        redirect_url: i.redirect_url,
        download_url: i.download_file ? `/download/${issueFreshDownloadToken(i.id)}` : null,
      }));
      return {
        order_id: o.id,
        amount_total: o.amount_total,
        currency: o.currency,
        created_at: o.created_at,
        items,
      };
    });
    res.json({ orders: result });
  } catch (err) { next(err); }
});

export const downloadRouter = Router();

downloadRouter.get('/:token', (req, res) => {
  const row = stmts.getDownloadToken.get(req.params.token);
  if (!row) return res.status(404).send('link invalid');
  if (row.expires_at < Date.now()) return res.status(410).send('link expired');
  if (row.used_count >= 10) return res.status(429).send('download limit reached');

  const item = getItemById.get(row.order_item_id);
  if (!item?.download_file) return res.status(404).send('nothing to download');

  const fp = productFilePath(item.download_file);
  if (!fs.existsSync(fp)) return res.status(500).send('file missing on server');

  stmts.incrementDownloadUse.run(req.params.token);
  res.download(fp, item.download_file);
});
