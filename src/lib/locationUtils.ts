export function primaryLocation(locationId: string | string[]): string {
  return Array.isArray(locationId) ? locationId[0]! : locationId
}

export function allLocations(locationId: string | string[]): string[] {
  return Array.isArray(locationId) ? locationId : [locationId]
}
