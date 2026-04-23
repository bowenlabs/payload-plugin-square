import { describe, expect, it } from 'vitest'

import { allLocations, primaryLocation } from '../lib/locationUtils.js'

describe('primaryLocation', () => {
  it('returns the string as-is when given a single location string', () => {
    expect(primaryLocation('LOC_ABC')).toBe('LOC_ABC')
  })

  it('returns the first element when given an array of locations', () => {
    expect(primaryLocation(['LOC_A', 'LOC_B', 'LOC_C'])).toBe('LOC_A')
  })

  it('returns the only element when given a single-element array', () => {
    expect(primaryLocation(['LOC_ONLY'])).toBe('LOC_ONLY')
  })
})

describe('allLocations', () => {
  it('wraps a single string in an array', () => {
    expect(allLocations('LOC_ABC')).toEqual(['LOC_ABC'])
  })

  it('returns the array as-is when given an array', () => {
    expect(allLocations(['LOC_A', 'LOC_B'])).toEqual(['LOC_A', 'LOC_B'])
  })

  it('wraps a single-element array without duplicating', () => {
    const input = ['LOC_ONLY']
    const result = allLocations(input)
    expect(result).toEqual(['LOC_ONLY'])
    // Should return the same array reference
    expect(result).toBe(input)
  })
})
