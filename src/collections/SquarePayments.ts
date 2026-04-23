import type { CollectionConfig } from 'payload'

export const SquarePayments: CollectionConfig = {
  slug: 'payments',
  admin: {
    useAsTitle: 'squarePaymentId',
    defaultColumns: ['squarePaymentId', 'status', 'amount', 'createdAt'],
    group: 'Square',
    description: 'Internal audit log of raw Square payment responses. Do not expose to end users.',
  },
  access: {
    // Restrict to authenticated users only; consuming apps should further
    // tighten this to admin-role users via their own access control override.
    read: ({ req }) => !!req.user,
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
}
