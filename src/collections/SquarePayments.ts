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
    description: 'Internal audit log of raw Square payment responses. Do not expose to end users.',
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
    },
    {
      name: 'rawResponse',
      type: 'json',
      admin: { description: 'Raw Square API payment response for reconciliation' },
    },
    {
      name: 'status',
      type: 'text',
    },
    {
      name: 'amount',
      type: 'number',
      admin: { description: 'Amount in cents' },
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
  ],
})
