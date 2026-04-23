import type { CollectionConfig } from 'payload'

import { adminOnlyAccess } from '../lib/accessControl.js'

export const createSquarePaymentsCollection = (
  isAdmin: (user: unknown) => boolean,
): CollectionConfig => ({
  slug: 'payments',
  admin: {
    useAsTitle: 'squarePaymentId',
    defaultColumns: ['squarePaymentId', 'status', 'amount', 'createdAt'],
    group: 'Square',
    description: 'Audit log of Square payment responses captured at checkout. Contains sensitive financial data — visible to admins only. Use squarePaymentId to look up a transaction in your Square Dashboard.',
  },
  access: {
    // Payment audit records contain sensitive financial data — admins only.
    read: adminOnlyAccess(isAdmin),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'squarePaymentId',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'squareOrderId',
      type: 'text',
      index: true,
      admin: { description: 'Square order ID this payment belongs to' },
    },
    {
      name: 'rawResponse',
      type: 'json',
      admin: { description: 'Full Square API payment response — useful for reconciliation and dispute resolution' },
    },
    {
      name: 'status',
      type: 'text',
      admin: { description: 'Square payment status: APPROVED, COMPLETED, CANCELED, or FAILED' },
    },
    {
      name: 'amount',
      type: 'number',
      admin: { description: 'Amount charged in cents (e.g. 1999 = $19.99)' },
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
  ],
})
