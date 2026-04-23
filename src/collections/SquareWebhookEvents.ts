import type { CollectionConfig } from 'payload'

export const SquareWebhookEvents: CollectionConfig = {
  slug: 'square-webhook-events',
  admin: {
    useAsTitle: 'eventId',
    defaultColumns: ['eventId', 'eventType', 'createdAt'],
    group: 'Square',
    description: 'Processed Square webhook event IDs — used for replay protection.',
  },
  access: {
    read: ({ req }) => !!req.user,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [
    { name: 'eventId', type: 'text', required: true, unique: true },
    { name: 'eventType', type: 'text' },
  ],
  timestamps: true,
}
