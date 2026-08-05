import fs from 'node:fs';
import path from 'node:path';
import 'dotenv/config';

const productsDir = process.env.PRODUCTS_DIR || './data/products';
const catalogFile = path.join(productsDir, 'catalog.json');

let cache = null;
let cacheMtime = 0;

export function loadCatalog() {
  const stat = fs.statSync(catalogFile);
  if (!cache || stat.mtimeMs !== cacheMtime) {
    cache = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
    cacheMtime = stat.mtimeMs;
  }
  return cache;
}

export function getProduct(id) {
  return loadCatalog().find(p => p.id === id) || null;
}

export function productFilePath(filename) {
  return path.join(productsDir, filename);
}

export function fmtMoney(cents, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: currency.toUpperCase(),
  }).format(cents / 100);
}
