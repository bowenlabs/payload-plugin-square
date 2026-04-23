import type { CollectionConfig } from 'payload'

import { adminOnlyAccess } from '../lib/accessControl.js'

export const createSquareWebhookEventsCollection = (
  isAdmin: (user: unknown) => boolean,
): CollectionConfig => ({
  slug: 'square-webhook-events',
  labels: {
    singular: 'Webhook Event',
    plural: 'Webhook Events',
  },
  admin: {
    useAsTitle: 'eventId',
    defaultColumns: ['eventId', 'eventType', 'createdAt'],
    group: 'Square',
    description: 'Processed Square webhook event IDs — used for replay protection.',
  },
  access: {
    // Internal dedup log — admins only.
    read: adminOnlyAccess(isAdmin),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'eventId', type: 'text', required: true, unique: true },
    { name: 'eventType', type: 'text' },
  ],
  timestamps: true,
})
