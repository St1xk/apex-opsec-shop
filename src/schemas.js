import { z } from 'zod';

export const CheckoutSchema = z.object({
  email: z.string().email(),
  items: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    unit_amount: z.number().int().positive().max(9_999_99),
    currency: z.string().length(3).default('usd'),
    quantity: z.number().int().positive().max(100),
  })).min(1).max(20),
  metadata: z.record(z.string()).optional(),
});

export const InvoiceSchema = z.object({
  customer_email: z.string().email(),
  customer_name: z.string().min(1).max(200),
  days_until_due: z.number().int().min(1).max(60).default(7),
  items: z.array(z.object({
    description: z.string().min(1).max(500),
    unit_amount: z.number().int().positive(),
    currency: z.string().length(3).default('usd'),
    quantity: z.number().int().positive().default(1),
  })).min(1).max(50),
  auto_advance: z.boolean().default(true),
  collection_method: z.enum(['send_invoice', 'charge_automatically']).default('send_invoice'),
});
