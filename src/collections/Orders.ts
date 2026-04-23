import type { CollectionConfig } from 'payload'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'total', 'createdAt'],
    group: 'Square',
  },
  access: {
    // Any authenticated user can read orders — admin staff need to see all records.
    // Row-level filtering (customers seeing only their own) is left to the application layer.
    read: ({ req }) => !!req.user,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'orderNumber',
      type: 'text',
      required: true,
      unique: true,
    },
    {
      name: 'status',
      type: 'select',
      defaultValue: 'pending',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Paid', value: 'paid' },
        { label: 'Failed', value: 'failed' },
        { label: 'Refunded', value: 'refunded' },
        { label: 'Partially Refunded', value: 'partially_refunded' },
      ],
    },
    {
      name: 'total',
      type: 'number',
      required: true,
      admin: { description: 'Total in cents' },
    },
    {
      name: 'subtotal',
      type: 'number',
      required: true,
      admin: { description: 'Subtotal in cents' },
    },
    {
      name: 'tax',
      type: 'number',
      admin: { description: 'Tax in cents' },
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
    },
    {
      name: 'squarePaymentId',
      type: 'text',
      index: true,
      admin: { description: 'Square payment ID for reconciliation' },
    },
    {
      name: 'squareOrderId',
      type: 'text',
      index: true,
      admin: { description: 'Square order ID for reconciliation' },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      admin: { description: 'Null for guest orders' },
    },
    {
      name: 'squareCustomer',
      type: 'relationship',
      relationTo: 'customers',
      required: false,
      admin: { description: 'Associated Square customer record — links loyalty data to this order' },
    },
    {
      name: 'guestEmail',
      type: 'email',
      admin: { description: 'Email for guest checkout orders' },
    },
    {
      name: 'lineItems',
      type: 'array',
      fields: [
        { name: 'productName', type: 'text', required: true },
        { name: 'variationName', type: 'text' },
        { name: 'quantity', type: 'number', required: true },
        {
          name: 'unitPrice',
          type: 'number',
          required: true,
          admin: { description: 'Unit price in cents' },
        },
        {
          name: 'totalPrice',
          type: 'number',
          required: true,
          admin: { description: 'Line total in cents' },
        },
        { name: 'squareCatalogObjectId', type: 'text' },
      ],
    },
  ],
}
