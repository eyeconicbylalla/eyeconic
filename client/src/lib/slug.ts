/**
 * Generate a URL-safe slug from a title.
 * NFKD normalize → strip diacritics → lowercase → [a-z0-9-] → max 80.
 */
export function generateSlug(title: string): string {
  return `${title || ''}`
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}
