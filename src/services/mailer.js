import nodemailer from 'nodemailer';
import 'dotenv/config';
import { logger } from '../logger.js';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.warn('SMTP not configured — emails will be logged only');
    return null;
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

export async function sendOrderEmail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) {
    logger.info({ to, subject }, 'EMAIL (no SMTP) — would send');
    return { skipped: true };
  }
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to, subject, html,
  });
  logger.info({ to, messageId: info.messageId }, 'email sent');
  return info;
}

export function buildOrderEmailHtml({ shopName, orderId, items, downloadBase, supportEmail }) {
  const rows = items.map(i => {
    let action = '';
    if (i.download_token) {
      action = `<a href="${downloadBase}/download/${i.download_token}" style="background:#635BFF;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Download</a>`;
    } else if (i.redirect_url) {
      action = `<a href="${i.redirect_url}" style="background:#635BFF;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block">Access</a>`;
    }
    const key = i.license_key ? `<div style="font-family:monospace;background:#f4f4f5;padding:8px;border-radius:4px;margin-top:8px">${i.license_key}</div>` : '';
    return `
      <tr>
        <td style="padding:16px 0;border-bottom:1px solid #eee">
          <div style="font-weight:600;font-size:16px">${i.product_name}</div>
          ${key}
          <div style="margin-top:12px">${action}</div>
        </td>
      </tr>`;
  }).join('');
  return `
  <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#111">
    <h2 style="margin:0 0 8px">Thanks for your order</h2>
    <div style="color:#666;font-size:14px">Order ${orderId} · ${shopName}</div>
    <table style="width:100%;margin-top:24px;border-collapse:collapse">${rows}</table>
    <p style="color:#666;font-size:13px;margin-top:32px">
      Need help? Reply to this email or reach us at ${supportEmail}.
    </p>
  </div>`;
}
