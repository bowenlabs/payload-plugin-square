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
    description: 'Product catalog synced from Square. Records are created and updated automatically — edit products in your Square Dashboard and trigger a sync to reflect changes here.',
  },
  fields: [
    {
      name: 'squareId',
      type: 'text',
      required: true,
      index: true,
      admin: { position: 'sidebar', description: 'Square catalog object ID for this item' },
    },
    {
      name: 'squareImageId',
      type: 'text',
      index: true,
      admin: { position: 'sidebar', readOnly: true, description: 'Square image object ID — used to sync the product image from Square' },
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
      admin: { position: 'sidebar', readOnly: true, description: 'Timestamp of the last successful sync from Square' },
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
      admin: { description: 'Product variants (size, color, etc.) synced from Square. Each variation has its own price and inventory count.' },
      fields: [
        { name: 'squareId', type: 'text', admin: { description: 'Square catalog variation ID — used as the cart item variationId at checkout' } },
        { name: 'name', type: 'text', admin: { description: 'Variation name, e.g. Small, Red / Large' } },
        { name: 'sku', type: 'text', admin: { description: 'Merchant-assigned SKU (stock-keeping unit)' } },
        { name: 'price', type: 'number', min: 0, admin: { description: 'Listed price in cents (e.g. 1999 = $19.99), synced from Square' } },
        { name: 'currency', type: 'text', admin: { description: 'ISO 4217 currency code, e.g. USD' } },
        { name: 'inventoryCount', type: 'number', min: 0, admin: { description: 'Current stock count. Updated automatically via Square inventory webhooks.' } },
      ],
    },
  ],
  timestamps: true,
})
