#!/usr/bin/env python3
"""
apex-manager.py — ApeX.opsec Administrative & Operations CLI
Direct database manager for orders, license issuance, redemptions, and subscriber tracking.
"""

import os
import sys
import time
import argparse
import sqlite3
import secrets

DB_PATH = os.environ.get("SHOP_DB_PATH", r"C:\stripe-shop\data\db\shop.db")
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

def get_conn():
    if not os.path.exists(DB_PATH):
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    init_schema(conn)
    return conn

def init_schema(conn):
    conn.executescript("""
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
        CREATE TABLE IF NOT EXISTS order_redemptions (
            order_id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            username TEXT NOT NULL,
            redeemed_at INTEGER NOT NULL
        );
    """)
    conn.commit()

def generate_key(prefix="AX"):
    segments = []
    for _ in range(4):
        seg = "".join(secrets.choice(ALPHABET) for _ in range(5))
        segments.append(seg)
    return f"{prefix}-{'-'.join(segments)}"

def create_manual_order(email, tier, amount_cents=None):
    tier_map = {
        "day": ("supporter-day", "1 Day Supporter", 499),
        "week": ("supporter-week", "1 Week Supporter", 1399),
        "month": ("supporter-month", "1 Month Supporter", 2499),
        "lifetime": ("supporter-lifetime", "Lifetime Supporter", 3000),
    }
    t_info = tier_map.get(tier.lower())
    if not t_info:
        print(f"[-] Invalid tier '{tier}'. Choose from: day, week, month, lifetime")
        return None

    prod_id, prod_name, default_cents = t_info
    cents = amount_cents if amount_cents is not None else default_cents
    now = int(time.time())
    order_id = f"ord_manual_{secrets.token_hex(6)}"
    session_id = f"cs_manual_{secrets.token_hex(8)}"
    key = generate_key()

    conn = get_conn()
    c = conn.cursor()

    # Customer
    c.execute("SELECT id FROM customers WHERE email = ?", (email,))
    row = c.fetchone()
    if row:
        cust_id = row[0]
    else:
        c.execute("INSERT INTO customers (email, created_at) VALUES (?, ?)", (email, now))
        cust_id = c.lastrowid

    # Order
    c.execute("""
        INSERT INTO orders (id, customer_id, stripe_session_id, stripe_payment_intent, amount_total, currency, status, created_at, fulfilled_at)
        VALUES (?, ?, ?, ?, ?, 'usd', 'paid', ?, ?)
    """, (order_id, cust_id, session_id, "pi_manual", cents, now, now))

    # Order item
    c.execute("""
        INSERT INTO order_items (order_id, product_id, product_name, unit_amount, quantity, license_key, download_file, redirect_url)
        VALUES (?, ?, ?, ?, 1, ?, 'apex-opsec-suite.zip', 'https://discord.gg/Nm5UsHpQuF')
    """, (order_id, prod_id, prod_name, cents, key))

    conn.commit()
    conn.close()

    print("[+] Manual order created successfully:")
    print(f"    Order ID:    {order_id}")
    print(f"    Customer:    {email}")
    print(f"    Product:     {prod_name} (${cents / 100:.2f})")
    print(f"    License Key: {key}")
    print(f"    Status:      paid")
    print(f"    Redeem via:  /redeem {order_id} (or /redeem {key}) in Discord")
    return order_id, key

def list_orders(limit=20):
    conn = get_conn()
    c = conn.cursor()
    c.execute("""
        SELECT o.id, c.email, i.product_name, i.license_key, o.status, o.created_at, r.user_id, r.username
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items i ON o.id = i.order_id
        LEFT JOIN order_redemptions r ON o.id = r.order_id
        ORDER BY o.created_at DESC
        LIMIT ?
    """, (limit,))
    rows = c.fetchall()
    conn.close()

    if not rows:
        print("[*] No orders recorded in database.")
        return

    print("\n" + "=" * 105)
    print(f"{'ORDER ID':<22} {'CUSTOMER':<24} {'PRODUCT':<18} {'STATUS':<8} {'REDEEMED BY':<20}")
    print("=" * 105)
    for r in rows:
        oid, email, prod, key, status, ts, uid, uname = r
        redeemed = f"{uname} ({uid})" if uid else "Unclaimed"
        print(f"{oid:<22} {email:<24} {prod:<18} {status:<8} {redeemed:<20}")
    print("=" * 105 + "\n")

def check_stats():
    conn = get_conn()
    c = conn.cursor()
    c.execute("SELECT count(*) FROM orders")
    total_orders = c.fetchone()[0]
    c.execute("SELECT count(*) FROM customers")
    total_customers = c.fetchone()[0]
    c.execute("SELECT count(*) FROM order_redemptions")
    total_redeemed = c.fetchone()[0]
    c.execute("SELECT sum(amount_total) FROM orders WHERE status = 'paid'")
    sum_val = c.fetchone()[0] or 0
    conn.close()

    print("\n=== APEX.OPSEC OPERATIONAL METRICS ===")
    print(f"  Total Orders:        {total_orders}")
    print(f"  Total Customers:     {total_customers}")
    print(f"  Active Redemptions:  {total_redeemed}")
    print(f"  Gross Revenue (DB):  ${sum_val / 100:.2f} USD")
    print("======================================\n")

def main():
    p = argparse.ArgumentParser(description="ApeX.opsec Admin CLI")
    sub = p.add_subparsers(dest="cmd")

    create_p = sub.add_parser("create", help="Create a manual order and license key")
    create_p.add_argument("--email", required=True, help="Customer email")
    create_p.add_argument("--tier", required=True, choices=["day", "week", "month", "lifetime"], help="Product tier")
    create_p.add_argument("--cents", type=int, default=None, help="Custom price in cents")

    sub.add_parser("list", help="List recent orders")
    sub.add_parser("stats", help="Display store analytics")

    args = p.parse_args()
    if args.cmd == "create":
        create_manual_order(args.email, args.tier, args.cents)
    elif args.cmd == "list":
        list_orders()
    elif args.cmd == "stats":
        check_stats()
    else:
        p.print_help()

if __name__ == "__main__":
    main()
