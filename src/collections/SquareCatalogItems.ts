import type { CollectionConfig, CollectionSlug } from 'payload'

export const createSquareCatalogItemsCollection = (
  mediaCollectionSlug: string = 'media',
): CollectionConfig => ({
  slug: 'catalog',
  labels: {
    singular: 'Catalog Item',
    plural: 'Catalog',
  },
  access: {
    read: () => true,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'type', 'lastSyncedAt', 'updatedAt'],
    group: 'Square',
    description: 'Read-only. Data is managed by Square and synced via the Square API.',
  },
  fields: [
    {
      name: 'squareId',
      type: 'text',
      required: true,
      index: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'squareImageId',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'type',
      type: 'select',
      options: ['ITEM', 'CATEGORY', 'DISCOUNT', 'TAX', 'MODIFIER_LIST', 'MODIFIER'],
      admin: { position: 'sidebar' },
    },
    {
      name: 'lastSyncedAt',
      type: 'date',
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: mediaCollectionSlug as CollectionSlug,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'description',
      type: 'textarea',
    },
    {
      name: 'variations',
      type: 'array',
      fields: [
        { name: 'squareId', type: 'text' },
        { name: 'name', type: 'text' },
        { name: 'sku', type: 'text' },
        { name: 'price', type: 'number' },
        { name: 'currency', type: 'text' },
        { name: 'inventoryCount', type: 'number' },
      ],
    },
  ],
  timestamps: true,
})
