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
    description: 'Log of processed Square webhook event IDs. Used to prevent duplicate processing when Square re-delivers an event. Read-only — managed entirely by the plugin.',
  },
  access: {
    // Internal dedup log — admins only.
    read: adminOnlyAccess(isAdmin),
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    {
      name: 'eventId',
      type: 'text',
      required: true,
      unique: true,
      admin: { description: 'Square-assigned unique event ID. Stored on first delivery; duplicate deliveries with the same ID are silently ignored.' },
    },
    {
      name: 'eventType',
      type: 'text',
      admin: { description: 'Square event type, e.g. payment.updated, order.updated, inventory.count.updated' },
    },
  ],
  timestamps: true,
})
