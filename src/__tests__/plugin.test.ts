import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { payloadPluginSquare } from '../index.js'

const baseOptions = {
  accessToken: 'test-access-token',
  locationId: 'LOC_TEST',
}

/** Returns a fresh minimal config each call — prevents mutation leaking between tests. */
const emptyConfig = () => ({} as Config)

describe('payloadPluginSquare — collections', () => {
  it('registers all five Square collections', () => {
    const config = payloadPluginSquare(baseOptions)(emptyConfig())
    const slugs = config.collections?.map((c) => c.slug) ?? []
    expect(slugs).toContain('catalog')
    expect(slugs).toContain('orders')
    expect(slugs).toContain('customers')
    expect(slugs).toContain('payments')
    expect(slugs).toContain('square-webhook-events')
  })

  it('appends to existing collections without losing them', () => {
    const config = payloadPluginSquare(baseOptions)({
      collections: [{ slug: 'posts', fields: [] }],
    } as unknown as Config)
    const slugs = config.collections?.map((c) => c.slug) ?? []
    expect(slugs).toContain('posts')
    expect(slugs).toContain('catalog')
  })

  it('still registers collections when disabled (schema consistency)', () => {
    const config = payloadPluginSquare({ ...baseOptions, disabled: true })(emptyConfig())
    const slugs = config.collections?.map((c) => c.slug) ?? []
    expect(slugs).toContain('catalog')
    expect(slugs).toContain('orders')
  })
})

describe('payloadPluginSquare — endpoints', () => {
  it('registers checkout, webhook, inventory-stream, and sync endpoints by default', () => {
    const config = payloadPluginSquare(baseOptions)(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).toContain('/square/checkout')
    expect(paths).toContain('/square/webhook')
    expect(paths).toContain('/square/inventory-stream')
    expect(paths).toContain('/square/sync')
  })

  it('does not register any endpoints when disabled', () => {
    const config = payloadPluginSquare({ ...baseOptions, disabled: true })(emptyConfig())
    expect(config.endpoints).toBeUndefined()
  })

  it('omits checkout endpoint when endpoints.checkout is false', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      endpoints: { checkout: false },
    })(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).not.toContain('/square/checkout')
    expect(paths).toContain('/square/webhook') // others still present
  })

  it('omits webhook endpoint when endpoints.webhook is false', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      endpoints: { webhook: false },
    })(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).not.toContain('/square/webhook')
  })

  it('omits sync endpoint when endpoints.sync is false', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      endpoints: { sync: false },
    })(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).not.toContain('/square/sync')
  })

  it('omits inventory-stream endpoint when endpoints.inventoryStream is false', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      endpoints: { inventoryStream: false },
    })(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).not.toContain('/square/inventory-stream')
  })

  it('registers loyalty balance endpoint when loyalty is configured', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      loyalty: { programId: 'main' },
    })(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).toContain('/square/loyalty/balance')
  })

  it('does not register loyalty endpoint without loyalty config', () => {
    const config = payloadPluginSquare(baseOptions)(emptyConfig())
    const paths = config.endpoints?.map((e) => e.path) ?? []
    expect(paths).not.toContain('/square/loyalty/balance')
  })
})

describe('payloadPluginSquare — scheduled sync', () => {
  it('registers a square-catalog-sync task when syncSchedule is provided', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      syncSchedule: '0 * * * *',
    })(emptyConfig())
    const tasks = config.jobs?.tasks ?? []
    expect(tasks.some((t) => t.slug === 'square-catalog-sync')).toBe(true)
  })

  it('adds an autoRun entry for the cron expression', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      syncSchedule: '0 * * * *',
    })(emptyConfig())
    const autoRun = config.jobs?.autoRun
    expect(Array.isArray(autoRun)).toBe(true)
    if (Array.isArray(autoRun)) {
      expect(autoRun.some((r) => r.cron === '0 * * * *')).toBe(true)
    }
  })

  it('merges with an existing autoRun array', () => {
    const existing = [{ cron: '*/5 * * * *', limit: 1, task: 'other-task' }]
    const config = payloadPluginSquare({
      ...baseOptions,
      syncSchedule: '0 * * * *',
    })({ jobs: { autoRun: existing } } as unknown as Config)
    const autoRun = config.jobs?.autoRun
    expect(Array.isArray(autoRun)).toBe(true)
    if (Array.isArray(autoRun)) {
      expect(autoRun).toHaveLength(2)
      expect(autoRun.some((r) => r.task === 'other-task')).toBe(true)
      expect(autoRun.some((r) => r.task === 'square-catalog-sync')).toBe(true)
    }
  })

  it('merges with an existing autoRun function', async () => {
    const existingFn = async () => [{ cron: '*/5 * * * *', limit: 1, task: 'other-task' }]
    const config = payloadPluginSquare({
      ...baseOptions,
      syncSchedule: '0 * * * *',
    })({ jobs: { autoRun: existingFn } } as unknown as Config)
    const autoRun = config.jobs?.autoRun
    expect(typeof autoRun).toBe('function')
    if (typeof autoRun === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resolved = await autoRun(null as any)
      expect(resolved).toHaveLength(2)
    }
  })

  it('does not create a job when syncSchedule is not provided', () => {
    const config = payloadPluginSquare(baseOptions)(emptyConfig())
    expect(config.jobs).toBeUndefined()
  })
})

describe('payloadPluginSquare — syncOnInit', () => {
  it('sets config.onInit when syncOnInit is true', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      syncOnInit: true,
    })(emptyConfig())
    expect(typeof config.onInit).toBe('function')
  })

  it('does not set config.onInit when syncOnInit is false', () => {
    const config = payloadPluginSquare({
      ...baseOptions,
      syncOnInit: false,
    })(emptyConfig())
    expect(config.onInit).toBeUndefined()
  })

  it('preserves an existing onInit hook when syncOnInit is true', () => {
    const existing = async () => {}
    const config = payloadPluginSquare({
      ...baseOptions,
      syncOnInit: true,
    })({ onInit: existing } as unknown as Config)
    // onInit should be a new wrapped function (not the original reference)
    expect(typeof config.onInit).toBe('function')
    expect(config.onInit).not.toBe(existing)
  })
})
