import { Router } from 'express';
import crypto from 'node:crypto';
import { stripe } from '../stripeClient.js';
import { InvoiceSchema } from '../schemas.js';

export const invoicesRouter = Router();

async function upsertCustomer(email, name) {
  const existing = await stripe.customers.list({ email, limit: 1 });
  if (existing.data[0]) return existing.data[0];
  return stripe.customers.create({ email, name });
}

invoicesRouter.post('/', async (req, res, next) => {
  try {
    const body = InvoiceSchema.parse(req.body);
    const idempotencyKey = req.header('x-idempotency-key') || crypto.randomUUID();
    const customer = await upsertCustomer(body.customer_email, body.customer_name);

    const invoice = await stripe.invoices.create({
      customer: customer.id,
      collection_method: body.collection_method,
      days_until_due: body.collection_method === 'send_invoice' ? body.days_until_due : undefined,
      auto_advance: body.auto_advance,
      pending_invoice_items_behavior: 'exclude',
    }, { idempotencyKey });

    for (const item of body.items) {
      await stripe.invoiceItems.create({
        customer: customer.id,
        invoice: invoice.id,
        currency: item.currency,
        unit_amount: item.unit_amount,
        quantity: item.quantity,
        description: item.description,
      });
    }

    const finalized = await stripe.invoices.finalizeInvoice(invoice.id);
    if (body.collection_method === 'send_invoice') {
      await stripe.invoices.sendInvoice(finalized.id);
    }

    res.json({
      id: finalized.id,
      number: finalized.number,
      hosted_invoice_url: finalized.hosted_invoice_url,
      invoice_pdf: finalized.invoice_pdf,
      status: finalized.status,
      amount_due: finalized.amount_due,
    });
  } catch (err) { next(err); }
});

invoicesRouter.get('/:id', async (req, res, next) => {
  try {
    const inv = await stripe.invoices.retrieve(req.params.id);
    res.json(inv);
  } catch (err) { next(err); }
});

invoicesRouter.post('/:id/void', async (req, res, next) => {
  try {
    const inv = await stripe.invoices.voidInvoice(req.params.id);
    res.json({ id: inv.id, status: inv.status });
  } catch (err) { next(err); }
});
