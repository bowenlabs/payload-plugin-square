import type { CollectionConfig } from 'payload'

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'loyaltyPoints', 'createdAt'],
    group: 'Square',
    description:
      'Square customer records. Created automatically at checkout for guests and logged-in users. Loyalty balance is synced from Square via webhook.',
  },
  access: {
    // Any authenticated user can read customer records — admin staff need full visibility.
    read: ({ req }) => !!req.user,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'squareCustomerId',
      type: 'text',
      unique: true,
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Square customer ID' },
    },
    {
      name: 'loyaltyAccountId',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Square Loyalty account ID — set on first checkout when loyalty is enabled',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      admin: { position: 'sidebar', description: 'Linked Payload user — null for guest customers' },
    },
    {
      name: 'email',
      type: 'email',
      index: true,
      admin: { description: 'Used to identify and merge guest customers' },
    },
    {
      name: 'displayName',
      type: 'text',
    },
    {
      name: 'loyaltyPoints',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Current point balance — synced from Square via loyalty.account.updated webhook',
      },
    },
  ],
  timestamps: true,
}
