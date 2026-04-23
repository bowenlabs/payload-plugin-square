import type { Access } from 'payload'

/**
 * Default isAdmin check — looks for 'admin' in a `roles` array on the user object.
 * Override via the plugin's `isAdmin` option if your user model uses a different shape.
 */
export const defaultIsAdmin = (user: unknown): boolean => {
  if (!user) return false
  const u = user as { roles?: unknown }
  return Array.isArray(u.roles) && u.roles.includes('admin')
}

/** Read access for admin users only. Unauthenticated requests are rejected. */
export function adminOnlyAccess(isAdmin: (user: unknown) => boolean): Access {
  return ({ req }) => {
    if (!req.user) return false
    return isAdmin(req.user)
  }
}

/**
 * Read access where admins see all records and authenticated users see only their own.
 * @param isAdmin   - predicate that returns true for admin users
 * @param selfQuery - given the current user's ID, returns a Payload where-clause that
 *                   selects only that user's records
 */
export function adminOrSelfAccess(
  isAdmin: (user: unknown) => boolean,
  selfQuery: (userId: string) => Record<string, unknown>,
): Access {
  return ({ req }) => {
    if (!req.user) return false
    if (isAdmin(req.user)) return true
    const userId = (req.user as { id: string }).id
    return selfQuery(userId) as ReturnType<Access>
  }
}
