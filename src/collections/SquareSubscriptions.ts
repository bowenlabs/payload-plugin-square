import type { CollectionConfig } from 'payload'

import { adminOrSelfAccess } from '../lib/accessControl.js'

export const createSquareSubscriptionsCollection = (
  isAdmin: (user: unknown) => boolean,
): CollectionConfig => ({
  slug: 'square-subscriptions',
  labels: { singular: 'Subscription', plural: 'Subscriptions' },
  admin: {
    useAsTitle: 'planName',
    defaultColumns: ['planName', 'status', 'cadence', 'priceAmount', 'startDate'],
    group: 'Square',
    description: 'Customer subscription records created via the subscribe endpoint. Status, billing dates, and cancellations are kept in sync automatically via Square webhooks.',
  },
  access: {
    // userId is stored directly (denormalized) to keep this a simple single-field query
    // rather than a two-level join (subscription → customer → user).
    read: adminOrSelfAccess(isAdmin, (userId) => ({ userId: { equals: userId } })),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'squareSubscriptionId',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'ACTIVE' },
        { label: 'Canceled', value: 'CANCELED' },
        { label: 'Paused', value: 'PAUSED' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Deactivated', value: 'DEACTIVATED' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'planVariationId',
      type: 'text',
      index: true,
      admin: { readOnly: true, description: 'Square catalog ID of the subscription plan variation the customer subscribed to' },
    },
    {
      name: 'planName',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'cadence',
      type: 'text',
      admin: { readOnly: true, description: 'Billing frequency from Square: MONTHLY, WEEKLY, ANNUAL, etc.' },
    },
    {
      name: 'priceAmount',
      type: 'number',
      admin: { readOnly: true, description: 'Recurring charge amount in cents per billing cycle (e.g. 999 = $9.99/month)' },
    },
    {
      name: 'currency',
      type: 'text',
      defaultValue: 'USD',
      admin: { readOnly: true },
    },
    {
      name: 'startDate',
      type: 'date',
      admin: { readOnly: true },
    },
    {
      name: 'chargedThroughDate',
      type: 'date',
      admin: { readOnly: true, description: 'The date through which the customer has already paid. After this date the next billing cycle begins.' },
    },
    {
      name: 'squareCustomerId',
      type: 'text',
      index: true,
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'squareCardId',
      type: 'text',
      admin: { readOnly: true, position: 'sidebar', description: 'Square card-on-file ID used for recurring billing. The card is stored securely in Square — no card data touches this server.' },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      // Denormalized from customer.user — enables a simple single-field access control query
      // without relying on a two-level join (subscription → customer → user).
      name: 'userId',
      type: 'text',
      index: true,
      admin: { readOnly: true, position: 'sidebar', description: 'Payload user ID of the subscriber — denormalized for fast access control queries' },
    },
    {
      name: 'idempotencyKey',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, position: 'sidebar', description: 'Idempotency key from the subscribe request. If a client retries with the same key, the existing subscription is returned instead of creating a duplicate.' },
    },
  ],
  timestamps: true,
})
