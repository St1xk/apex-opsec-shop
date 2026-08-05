import { stripe } from '../stripeClient.js';
import { db, stmts } from './db.js';
import { getProduct, productFilePath } from './catalog.js';
import { generateLicense, generateDownloadToken } from './licenses.js';
import { sendOrderEmail, buildOrderEmailHtml } from './mailer.js';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import 'dotenv/config';

const DOWNLOAD_TTL_MS = (Number(process.env.DOWNLOADS_TTL_HOURS) || 48) * 3600 * 1000;

export async function fulfillCheckoutSession(sessionId) {
  const existing = stmts.getOrderBySession.get(sessionId);
  if (existing && existing.status === 'fulfilled') {
    logger.info({ sessionId }, 'already fulfilled — skipping');
    return { order_id: existing.id, already: true };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['line_items', 'line_items.data.price.product', 'payment_intent'],
  });

  if (session.payment_status !== 'paid') {
    logger.warn({ sessionId, status: session.payment_status }, 'not paid');
    return { skipped: true };
  }

  const email = session.customer_details?.email || session.customer_email;
  if (!email) throw new Error('no email on session');

  const now = Date.now();
  const orderId = existing?.id || `ord_${nanoid(16)}`;

  const tx = db.transaction(() => {
    const customer = stmts.upsertCustomer.get({
      email,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : session.customer?.id || null,
      created_at: now,
    });

    if (!existing) {
      stmts.insertOrder.run({
        id: orderId,
        customer_id: customer.id,
        stripe_session_id: session.id,
        stripe_payment_intent: session.payment_intent?.id || session.payment_intent || null,
        amount_total: session.amount_total,
        currency: session.currency,
        status: 'pending',
        created_at: now,
      });
    }

    const items = [];
    for (const li of session.line_items.data) {
      const productId = li.price?.product?.metadata?.product_id
        || li.price?.metadata?.product_id
        || li.description;
      const product = getProduct(productId);
      if (!product) {
        logger.error({ productId }, 'unknown product in fulfilled session');
        continue;
      }

      const licenseKey = product.delivery.license ? generateLicense() : null;
      const info = stmts.insertOrderItem.run({
        order_id: orderId,
        product_id: product.id,
        product_name: product.name,
        unit_amount: li.amount_total / li.quantity,
        quantity: li.quantity,
        license_key: licenseKey,
        download_file: product.delivery.type === 'file' ? product.delivery.file : null,
        redirect_url: product.delivery.type === 'redirect' ? product.delivery.url : null,
      });

      let downloadToken = null;
      if (product.delivery.type === 'file') {
        downloadToken = generateDownloadToken();
        stmts.insertDownloadToken.run({
          token: downloadToken,
          order_item_id: info.lastInsertRowid,
          expires_at: now + DOWNLOAD_TTL_MS,
        });
      }

      items.push({
        product_name: product.name,
        license_key: licenseKey,
        download_token: downloadToken,
        redirect_url: product.delivery.type === 'redirect' ? product.delivery.url : null,
      });
    }

    stmts.markOrderFulfilled.run(now, orderId);
    return items;
  });

  const items = tx();

  try {
    await sendOrderEmail({
      to: email,
      subject: `Your order — ${process.env.SHOP_NAME || 'Shop'}`,
      html: buildOrderEmailHtml({
        shopName: process.env.SHOP_NAME || 'Shop',
        orderId,
        items,
        downloadBase: process.env.PUBLIC_URL || 'http://localhost:4242',
        supportEmail: process.env.SHOP_SUPPORT_EMAIL || 'support@example.com',
      }),
    });
  } catch (err) {
    logger.error({ err, orderId }, 'email failed but order was fulfilled');
  }

  return { order_id: orderId, items };
}

export function issueFreshDownloadToken(orderItemId) {
  const token = generateDownloadToken();
  stmts.insertDownloadToken.run({
    token,
    order_item_id: orderItemId,
    expires_at: Date.now() + DOWNLOAD_TTL_MS,
  });
  return token;
}

export function fileExistsForProduct(filename) {
  try { return fs.existsSync(productFilePath(filename)); }
  catch { return false; }
}
