export type CheckSeverity = 'error' | 'warning' | 'info';

export interface ContentCheckIssue {
  id: string;
  severity: CheckSeverity;
  message: string;
  path?: string;
}

export interface TipTapNode {
  type?: string;
  attrs?: Record<string, unknown>;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type?: string; attrs?: Record<string, unknown> }>;
}

function walk(node: TipTapNode | null | undefined, visit: (n: TipTapNode, path: string) => void, path = 'doc') {
  if (!node) return;
  visit(node, path);
  (node.content || []).forEach((child, i) => walk(child, visit, `${path}/${child.type || 'node'}[${i}]`));
}

function getText(node: TipTapNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(getText).join(' ');
}

/**
 * Advisory accessibility scan over a TipTap JSON document.
 * - Missing image alt → error
 * - Heading level skips → warning
 * - YouTube without title → warning
 */
export function analyzeAccessibility(doc: TipTapNode | null | undefined): ContentCheckIssue[] {
  const issues: ContentCheckIssue[] = [];
  if (!doc || doc.type !== 'doc') return issues;

  let lastHeadingLevel = 0;
  let imageIndex = 0;
  let youtubeIndex = 0;

  walk(doc, (node, path) => {
    if (node.type === 'image') {
      imageIndex += 1;
      const alt = `${node.attrs?.alt ?? ''}`.trim();
      if (!alt) {
        issues.push({
          id: `img-alt-${imageIndex}`,
          severity: 'error',
          message: `Image ${imageIndex} is missing alt text.`,
          path,
        });
      }
    }

    if (node.type === 'heading') {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level) || 2));
      if (lastHeadingLevel > 0 && level > lastHeadingLevel + 1) {
        issues.push({
          id: `heading-skip-${path}`,
          severity: 'warning',
          message: `Heading jumps from H${lastHeadingLevel} to H${level} (“${getText(node).trim().slice(0, 48) || 'untitled'}”).`,
          path,
        });
      }
      lastHeadingLevel = level;
    }

    if (node.type === 'youtube') {
      youtubeIndex += 1;
      const title = `${node.attrs?.title ?? ''}`.trim();
      if (!title || title === 'YouTube video') {
        issues.push({
          id: `youtube-title-${youtubeIndex}`,
          severity: 'warning',
          message: `YouTube embed ${youtubeIndex} has no descriptive title.`,
          path,
        });
      }
    }
  });

  return issues;
}

export interface SeoTipsInput {
  title?: string;
  slug?: string;
  metaDescription?: string;
  wordCount?: number;
}

/**
 * Advisory SEO tips for the editor sidebar.
 */
export function analyzeSeoTips(input: SeoTipsInput): ContentCheckIssue[] {
  const tips: ContentCheckIssue[] = [];
  const title = `${input.title || ''}`.trim();
  const slug = `${input.slug || ''}`.trim();
  const meta = `${input.metaDescription || ''}`.trim();
  const words = Number(input.wordCount) || 0;

  if (!title) {
    tips.push({ id: 'seo-title-missing', severity: 'error', message: 'Add a post title.' });
  } else if (title.length < 30) {
    tips.push({ id: 'seo-title-short', severity: 'warning', message: 'Title is under 30 characters — consider expanding it.' });
  } else if (title.length > 60) {
    tips.push({ id: 'seo-title-long', severity: 'warning', message: 'Title is over 60 characters and may truncate in search results.' });
  }

  if (!slug) {
    tips.push({ id: 'seo-slug-missing', severity: 'warning', message: 'Add a URL slug.' });
  } else if (slug.length < 5) {
    tips.push({ id: 'seo-slug-short', severity: 'info', message: 'Slug is very short — a few descriptive words help SEO.' });
  } else if (slug.length > 80) {
    tips.push({ id: 'seo-slug-long', severity: 'warning', message: 'Slug exceeds 80 characters.' });
  }

  if (!meta) {
    tips.push({ id: 'seo-meta-missing', severity: 'warning', message: 'Add a meta description.' });
  } else if (meta.length < 70) {
    tips.push({ id: 'seo-meta-short', severity: 'info', message: 'Meta description is under 70 characters.' });
  } else if (meta.length > 160) {
    tips.push({ id: 'seo-meta-long', severity: 'warning', message: 'Meta description exceeds 160 characters.' });
  }

  if (words > 0 && words < 100) {
    tips.push({ id: 'seo-words-short', severity: 'info', message: 'Body is under 100 words — longer posts often rank better.' });
  }

  if (!tips.length) {
    tips.push({ id: 'seo-ok', severity: 'info', message: 'SEO looks solid.' });
  }

  return tips;
}
