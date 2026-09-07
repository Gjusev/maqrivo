/**
 * Privilege model: the FIRST registered account is the administrator — it
 * gates ingestion job triggering and global-catalog mutations. Derived from
 * existing data (earliest `user.created_at`), no schema change.
 *
 * Pure predicate, split from session.ts so tests can import it without the
 * db/next runtime (server/db.ts throws without DATABASE_URL at import time).
 */
export function isAdminUser(
  userId: string | null | undefined,
  earliestUserId: string | null | undefined,
): boolean {
  if (userId === null || userId === undefined) return false;
  return userId === earliestUserId;
}
