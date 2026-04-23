import type { CollectionConfig } from 'payload'

export const SquareSubscriptions: CollectionConfig = {
  slug: 'square-subscriptions',
  labels: { singular: 'Subscription', plural: 'Subscriptions' },
  admin: {
    useAsTitle: 'planName',
    defaultColumns: ['planName', 'status', 'cadence', 'priceAmount', 'startDate'],
    group: 'Square',
    description: 'Active Square subscriptions. Created via the subscribe endpoint; status synced via webhooks.',
  },
  access: {
    // All authenticated users can read subscriptions — needed for admin panel visibility.
    // ⚠ If end-users have Payload accounts, tighten this to prevent users from reading
    // each other's subscription records via GET /api/square-subscriptions.
    read: ({ req }) => !!req.user,
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
      admin: { readOnly: true, description: 'Square SUBSCRIPTION_PLAN_VARIATION catalog object ID' },
    },
    {
      name: 'planName',
      type: 'text',
      admin: { readOnly: true },
    },
    {
      name: 'cadence',
      type: 'text',
      admin: { readOnly: true, description: 'e.g. MONTHLY, WEEKLY, ANNUAL' },
    },
    {
      name: 'priceAmount',
      type: 'number',
      admin: { readOnly: true, description: 'Recurring price in cents' },
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
      admin: { readOnly: true, description: 'Date through which the subscription is paid' },
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
      admin: { readOnly: true, position: 'sidebar', description: 'Square card-on-file ID used for billing' },
    },
    {
      name: 'customer',
      type: 'relationship',
      relationTo: 'customers',
      index: true,
      admin: { position: 'sidebar' },
    },
  ],
  timestamps: true,
}
