import type { CollectionConfig } from 'payload'

export const Orders: CollectionConfig = {
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'total', 'createdAt'],
    group: 'Square',
  },
  access: {
    // All authenticated users can read orders — needed for admin panel visibility.
    // ⚠ If end-users have Payload accounts (e.g. a storefront login), tighten this in your
    // app config to add row-level filtering, otherwise users can read each other's orders
    // via GET /api/orders. Example:
    //   read: ({ req }) => req.user?.roles?.includes('admin') || { user: { equals: req.user?.id } }
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
    {
      name: 'shippingAddress',
      type: 'group',
      admin: { description: 'Shipping destination for physical orders' },
      fields: [
        { name: 'firstName', type: 'text' },
        { name: 'lastName', type: 'text' },
        { name: 'address1', type: 'text' },
        { name: 'address2', type: 'text' },
        { name: 'city', type: 'text' },
        { name: 'state', type: 'text' },
        { name: 'zip', type: 'text' },
        { name: 'country', type: 'text', defaultValue: 'US' },
        { name: 'phone', type: 'text' },
      ],
    },
    {
      name: 'shippingAmount',
      type: 'number',
      admin: { description: 'Shipping charge in cents' },
    },
    {
      name: 'fulfillmentStatus',
      type: 'select',
      options: [
        { label: 'Pending', value: 'pending' },
        { label: 'Shipped', value: 'shipped' },
        { label: 'Delivered', value: 'delivered' },
        { label: 'Failed', value: 'failed' },
      ],
      admin: { description: 'Synced from Square order.fulfillment.updated webhook' },
    },
    {
      name: 'shippingCarrier',
      type: 'text',
      admin: { description: 'Carrier name as reported by Square (e.g. UPS, USPS)' },
    },
    {
      name: 'trackingNumber',
      type: 'text',
      admin: { description: 'Carrier tracking number' },
    },
    {
      name: 'trackingUrl',
      type: 'text',
      admin: { description: 'Direct link to carrier tracking page' },
    },
    {
      name: 'squareFulfillmentUid',
      type: 'text',
      index: true,
      admin: { description: 'Square fulfillment UID — used to match order.fulfillment.updated events' },
    },
  ],
}
