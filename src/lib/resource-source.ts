export type ResourceSource = 'user' | 'daily_auto' | 'featured'

export const ARCHIVE_WINDOW_DAYS = 30

export function isArchived(createdAt: string): boolean {
  const cutoff = Date.now() - ARCHIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return new Date(createdAt).getTime() < cutoff
}
