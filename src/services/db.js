import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';

const dbPath = process.env.DB_PATH || './data/db/shop.db';
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    stripe_customer_id TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers(id),
    stripe_session_id TEXT UNIQUE NOT NULL,
    stripe_payment_intent TEXT,
    amount_total INTEGER NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    fulfilled_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL REFERENCES orders(id),
    product_id TEXT NOT NULL,
    product_name TEXT NOT NULL,
    unit_amount INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    license_key TEXT,
    download_file TEXT,
    redirect_url TEXT
  );

  CREATE TABLE IF NOT EXISTS download_tokens (
    token TEXT PRIMARY KEY,
    order_item_id INTEGER NOT NULL REFERENCES order_items(id),
    expires_at INTEGER NOT NULL,
    used_count INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
`);

export const stmts = {
  upsertCustomer: db.prepare(`
    INSERT INTO customers (email, stripe_customer_id, created_at)
    VALUES (@email, @stripe_customer_id, @created_at)
    ON CONFLICT(email) DO UPDATE SET
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, customers.stripe_customer_id)
    RETURNING *
  `),
  getCustomerByEmail: db.prepare(`SELECT * FROM customers WHERE email = ?`),
  insertOrder: db.prepare(`
    INSERT INTO orders (id, customer_id, stripe_session_id, stripe_payment_intent,
                        amount_total, currency, status, created_at)
    VALUES (@id, @customer_id, @stripe_session_id, @stripe_payment_intent,
            @amount_total, @currency, @status, @created_at)
  `),
  markOrderFulfilled: db.prepare(`
    UPDATE orders SET status = 'fulfilled', fulfilled_at = ? WHERE id = ?
  `),
  getOrderBySession: db.prepare(`SELECT * FROM orders WHERE stripe_session_id = ?`),
  getOrder: db.prepare(`SELECT * FROM orders WHERE id = ?`),
  insertOrderItem: db.prepare(`
    INSERT INTO order_items (order_id, product_id, product_name, unit_amount,
                             quantity, license_key, download_file, redirect_url)
    VALUES (@order_id, @product_id, @product_name, @unit_amount,
            @quantity, @license_key, @download_file, @redirect_url)
  `),
  getOrderItems: db.prepare(`SELECT * FROM order_items WHERE order_id = ?`),
  getCustomerOrders: db.prepare(`
    SELECT o.*, c.email FROM orders o
    JOIN customers c ON c.id = o.customer_id
    WHERE c.email = ? AND o.status = 'fulfilled'
    ORDER BY o.created_at DESC
  `),
  insertDownloadToken: db.prepare(`
    INSERT INTO download_tokens (token, order_item_id, expires_at)
    VALUES (@token, @order_item_id, @expires_at)
  `),
  getDownloadToken: db.prepare(`SELECT * FROM download_tokens WHERE token = ?`),
  incrementDownloadUse: db.prepare(`
    UPDATE download_tokens SET used_count = used_count + 1 WHERE token = ?
  `),
  listAllOrders: db.prepare(`
    SELECT o.*, c.email FROM orders o
    JOIN customers c ON c.id = o.customer_id
    ORDER BY o.created_at DESC LIMIT 500
  `),
};
