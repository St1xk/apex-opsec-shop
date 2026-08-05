import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', '..', 'public');

const cache = new Map();

function render(file) {
  if (cache.has(file) && process.env.NODE_ENV === 'production') return cache.get(file);
  let html = fs.readFileSync(path.join(publicDir, file), 'utf8');
  html = html
    .replaceAll('__SHOP_NAME__', process.env.SHOP_NAME || 'Shop')
    .replaceAll('__SHOP_TAGLINE__', process.env.SHOP_TAGLINE || '')
    .replaceAll('__SHOP_SUPPORT_EMAIL__', process.env.SHOP_SUPPORT_EMAIL || 'support@example.com');
  cache.set(file, html);
  return html;
}

export const pagesRouter = Router();

const routes = {
  '/': 'index.html',
  '/success': 'success.html',
  '/cancel': 'cancel.html',
  '/orders.html': 'orders.html',
};

for (const [route, file] of Object.entries(routes)) {
  pagesRouter.get(route, (_req, res) => {
    res.type('html').send(render(file));
  });
}
