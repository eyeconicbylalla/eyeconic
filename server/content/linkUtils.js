const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob):/i;

function sanitizeLinkUrl(raw = '') {
  const value = `${raw || ''}`.trim();
  if (!value) return { ok: false, error: 'URL is required.' };
  if (value.includes('\0')) return { ok: false, error: 'Invalid URL.' };
  if (BLOCKED_SCHEMES.test(value)) return { ok: false, error: 'This URL scheme is not allowed.' };
  if (value.startsWith('//')) return { ok: false, error: 'Protocol-relative URLs are not allowed.' };

  if (value.startsWith('/') || value.startsWith('#')) {
    return { ok: true, href: value };
  }

  if (/^mailto:/i.test(value) || /^tel:/i.test(value)) {
    return { ok: true, href: value };
  }

  if (/^https?:\/\//i.test(value)) {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, error: 'Only http and https links are allowed.' };
      }
      return { ok: true, href: parsed.toString() };
    } catch {
      return { ok: false, error: 'Invalid URL.' };
    }
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { ok: true, href: `mailto:${value}` };
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
    return { ok: true, href: `https://${value}` };
  }

  return { ok: false, error: 'Invalid or unsupported URL.' };
}

function linkAttrs(href) {
  const isExternal = /^https?:\/\//i.test(href);
  if (!isExternal) return { href };
  return { href, target: '_blank', rel: 'noopener noreferrer nofollow' };
}

module.exports = { sanitizeLinkUrl, linkAttrs };
