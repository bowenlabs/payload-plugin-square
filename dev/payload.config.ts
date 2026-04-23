import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { payloadPluginSquare } from 'payload-plugin-square'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

import { testEmailAdapter } from './helpers/testEmailAdapter.js'
import { seed } from './seed.js'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

if (!process.env.ROOT_DIR) {
  process.env.ROOT_DIR = dirname
}

export default buildConfig({
  admin: {
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    {
      slug: 'posts',
      fields: [],
    },
    {
      slug: 'media',
      access: { read: () => true },
      fields: [],
      upload: {
        staticDir: path.resolve(dirname, 'media'),
      },
    },
    {
      slug: 'square-media',
      labels: { singular: 'Image', plural: 'Images' },
      admin: { group: 'Square', useAsTitle: 'filename', description: 'Read-only. Images are managed by Square and synced via catalog sync.' },
      access: { read: () => true, create: () => false, update: () => false, delete: () => false },
      fields: [],
      upload: {
        staticDir: path.resolve(dirname, 'square-media'),
      },
    },
  ],
  db: sqliteAdapter({
    client: {
      url: process.env.NODE_ENV === 'test' ? ':memory:' : 'file:./dev.db',
    },
  }),
  editor: lexicalEditor(),
  email: testEmailAdapter,
  onInit: async (payload) => {
    await seed(payload)
  },
  plugins: [
    payloadPluginSquare({
      accessToken: process.env.SQUARE_ACCESS_TOKEN || '',
      locationId: process.env.SQUARE_LOCATION_ID || '',
      environment: (process.env.SQUARE_ENVIRONMENT as 'sandbox' | 'production') || 'sandbox',
      webhookSecret: process.env.SQUARE_WEBHOOK_SECRET,
      mediaCollectionSlug: 'square-media',
      syncOnInit: true,
      shipping: {
        rates: [
          { id: 'standard', name: 'Standard Shipping', amount: 599, estimatedDays: 5 },
          { id: 'express', name: 'Express Shipping', amount: 1499, estimatedDays: 2 },
        ],
        freeShippingThreshold: 5000,
      },
      subscriptions: {},
    }),
  ],
  secret: process.env.PAYLOAD_SECRET || 'test-secret_key',
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
