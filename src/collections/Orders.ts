import type { CollectionConfig } from 'payload'

import { adminOrSelfAccess } from '../lib/accessControl.js'

export const createOrdersCollection = (
  isAdmin: (user: unknown) => boolean,
): CollectionConfig => ({
  slug: 'orders',
  admin: {
    useAsTitle: 'orderNumber',
    defaultColumns: ['orderNumber', 'status', 'total', 'createdAt'],
    group: 'Square',
    description:
      'Customer purchase records created at checkout. Read-only — status and fulfillment are updated automatically via Square webhooks.',
  },
  access: {
    read: adminOrSelfAccess(isAdmin, (userId) => ({ user: { equals: userId } })),
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
      admin: { description: 'Order total in cents, including tax and shipping (e.g. 1999 = $19.99)' },
    },
    {
      name: 'subtotal',
      type: 'number',
      required: true,
      admin: { description: 'Pre-tax, pre-shipping item subtotal in cents' },
    },
    {
      name: 'tax',
      type: 'number',
      admin: { description: 'Tax collected in cents' },
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
      admin: { description: 'Square payment ID — look this up in your Square Dashboard under Payments' },
    },
    {
      name: 'squareOrderId',
      type: 'text',
      index: true,
      admin: { description: 'Square order ID — look this up in your Square Dashboard under Orders' },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      admin: { description: 'Logged-in user who placed this order. Empty for guest orders.' },
    },
    {
      name: 'squareCustomer',
      type: 'relationship',
      relationTo: 'customers',
      required: false,
      admin: { description: 'Customer profile linked to this order — stores loyalty account and order history' },
    },
    {
      name: 'guestEmail',
      type: 'email',
      admin: { description: 'Email address provided at checkout for guest (non-logged-in) orders' },
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
          admin: { description: 'Price per unit in cents at time of purchase (e.g. 1999 = $19.99)' },
        },
        {
          name: 'totalPrice',
          type: 'number',
          required: true,
          admin: { description: 'quantity × unit price in cents' },
        },
        { name: 'squareCatalogObjectId', type: 'text', admin: { description: 'Square catalog variation ID for this line item' } },
      ],
    },
    {
      name: 'shippingAddress',
      type: 'group',
      admin: { description: 'Destination address for physical fulfillment. Only present when shipping was selected at checkout.' },
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
      admin: { description: 'Shipping fee charged in cents (e.g. 799 = $7.99). Zero when free shipping applies.' },
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
      admin: { description: 'Updated automatically when Square reports a fulfillment state change. Update the shipment in your Square Dashboard to advance this status.' },
    },
    {
      name: 'shippingCarrier',
      type: 'text',
      admin: { description: 'Carrier name as reported by Square (e.g. UPS, USPS, FedEx). Set via Square Dashboard.' },
    },
    {
      name: 'trackingNumber',
      type: 'text',
      admin: { description: 'Carrier tracking number. Set via Square Dashboard when the order ships.' },
    },
    {
      name: 'trackingUrl',
      type: 'text',
      admin: { description: 'Direct link to the carrier tracking page, synced from Square.' },
    },
    {
      name: 'squareFulfillmentUid',
      type: 'text',
      index: true,
      admin: { description: 'Internal Square fulfillment ID — used to match incoming webhook events to this order. Do not edit.' },
    },
  ],
})
