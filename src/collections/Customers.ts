import type { CollectionConfig } from 'payload'

import { adminOrSelfAccess } from '../lib/accessControl.js'

export const createCustomersCollection = (
  isAdmin: (user: unknown) => boolean,
): CollectionConfig => ({
  slug: 'customers',
  admin: {
    useAsTitle: 'displayName',
    defaultColumns: ['displayName', 'email', 'loyaltyPoints', 'createdAt'],
    group: 'Square',
    description:
      'Customer profiles created automatically at checkout. Each record links a Payload user (or guest email) to their Square customer ID, loyalty account, and order history. Read-only — data is managed by the plugin.',
  },
  access: {
    read: adminOrSelfAccess(isAdmin, (userId) => ({ user: { equals: userId } })),
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
      admin: { position: 'sidebar', readOnly: true, description: 'Square customer ID — look this up in your Square Dashboard under Customers' },
    },
    {
      name: 'loyaltyAccountId',
      type: 'text',
      index: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Square Loyalty account ID. Created the first time a customer opts in to the loyalty program at checkout.',
      },
    },
    {
      name: 'user',
      type: 'relationship',
      relationTo: 'users',
      required: false,
      index: true,
      admin: { position: 'sidebar', description: 'Linked Payload user account. Empty for guest customers who checked out without signing in.' },
    },
    {
      name: 'email',
      type: 'email',
      index: true,
      admin: { description: 'Email address used to identify guest customers and link their orders across sessions.' },
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
        description: 'Current loyalty point balance. Updated automatically via Square webhook whenever points are earned or redeemed.',
      },
    },
  ],
  timestamps: true,
})
