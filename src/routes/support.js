import { Router } from 'express';
import { z } from 'zod';
import { sendOrderEmail } from '../services/mailer.js';
import { logger } from '../logger.js';

export const supportRouter = Router();

const ContactBody = z.object({
  email: z.string().email().max(200),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  order_id: z.string().max(64).nullable().optional(),
});

supportRouter.post('/contact', async (req, res, next) => {
  try {
    const b = ContactBody.parse(req.body);
    const to = process.env.SHOP_SUPPORT_EMAIL || process.env.SMTP_FROM;
    if (!to) return res.status(500).json({ error: 'support inbox not configured' });

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:560px;padding:24px">
        <h2 style="margin:0 0 4px">New support message</h2>
        <div style="color:#666;font-size:13px;margin-bottom:24px">${b.subject}</div>
        <div style="background:#f4f4f5;padding:16px;border-radius:8px;margin-bottom:24px;white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(b.body)}</div>
        <div style="color:#666;font-size:13px">
          <div><b>From:</b> ${escapeHtml(b.email)}</div>
          ${b.order_id ? `<div><b>Order:</b> ${escapeHtml(b.order_id)}</div>` : ''}
          <div><b>Received:</b> ${new Date().toISOString()}</div>
        </div>
      </div>`;

    await sendOrderEmail({
      to,
      subject: `[Support] ${b.subject}`,
      html,
    });

    logger.info({ from: b.email, subject: b.subject }, 'support message received');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
