import { linkAttrs, sanitizeLinkUrl } from './linkUtils';
import type { TipTapNode } from './contentChecks';

export const FONT_FAMILIES: Record<string, string> = {
  sans: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  serif: 'Georgia, "Times New Roman", Times, serif',
  mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  system: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const ALLOWED_IMAGE_LAYOUTS = new Set(['inline', 'wrap-left', 'wrap-right', 'full-width']);
const ALLOWED_ALIGN = new Set(['left', 'center', 'right', 'justify']);
const ALLOWED_SPACING = new Set(['small', 'medium', 'large']);

function escapeHtml(value = ''): string {
  return `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function slugifyHeading(value = ''): string {
  return (
    `${value}`
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'section'
  );
}

function getTextAlignStyle(attrs: Record<string, unknown> = {}): string {
  const align = attrs.textAlign;
  if (typeof align !== 'string' || !ALLOWED_ALIGN.has(align)) return '';
  return `text-align:${align};`;
}

function renderMarks(text: string, marks: TipTapNode['marks'] = []): string {
  let html = escapeHtml(text);
  const sorted = [...(marks || [])].sort((a, b) => {
    const order = ['link', 'fontFamily', 'bold', 'italic', 'underline', 'strike', 'highlight', 'code'];
    return order.indexOf(a.type || '') - order.indexOf(b.type || '');
  });

  for (const mark of sorted) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`;
        break;
      case 'italic':
        html = `<em>${html}</em>`;
        break;
      case 'underline':
        html = `<u>${html}</u>`;
        break;
      case 'strike':
        html = `<s>${html}</s>`;
        break;
      case 'code':
        html = `<code>${html}</code>`;
        break;
      case 'highlight':
        html = `<mark>${html}</mark>`;
        break;
      case 'fontFamily': {
        const key = `${mark.attrs?.fontFamily || 'sans'}`;
        const family = FONT_FAMILIES[key] || FONT_FAMILIES.sans;
        html = `<span class="ec-font" data-font="${escapeHtml(key)}" style="font-family:${escapeHtml(family)}">${html}</span>`;
        break;
      }
      case 'link': {
        const result = sanitizeLinkUrl(`${mark.attrs?.href || ''}`);
        if (!result.ok) break;
        const attrs = linkAttrs(result.href);
        const attrStr = Object.entries(attrs)
          .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
          .join(' ');
        html = `<a ${attrStr}>${html}</a>`;
        break;
      }
      default:
        break;
    }
  }

  return html;
}

function renderInline(nodes: TipTapNode[] = []): string {
  return (nodes || [])
    .map((node) => {
      if (node.type === 'text') return renderMarks(node.text || '', node.marks);
      if (node.type === 'hardBreak') return '<br />';
      return '';
    })
    .join('');
}

function getYoutubeId(url = ''): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.replace('/', '').trim();
    if (parsed.hostname.includes('youtube.com')) {
      const byQuery = parsed.searchParams.get('v');
      if (byQuery) return byQuery;
      const parts = parsed.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'embed' || p === 'shorts');
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
    }
  } catch {
    return '';
  }
  return '';
}

function stripText(node: TipTapNode | null | undefined): string {
  if (!node) return '';
  if (node.type === 'text') return node.text || '';
  return (node.content || []).map(stripText).join(' ');
}

function renderImage(node: TipTapNode): string {
  const attrs = node.attrs || {};
  const src = `${attrs.src || ''}`.trim();
  if (!src || /^(javascript|vbscript|data:text\/html)/i.test(src)) return '';

  const alt = escapeHtml(`${attrs.alt || ''}`);
  const caption = attrs.caption ? escapeHtml(`${attrs.caption}`) : '';
  const layout = ALLOWED_IMAGE_LAYOUTS.has(`${attrs.layout}`) ? `${attrs.layout}` : 'inline';
  const align = ['left', 'center', 'right'].includes(`${attrs.align}`) ? `${attrs.align}` : 'center';
  const spacing = ALLOWED_SPACING.has(`${attrs.spacing}`) ? `${attrs.spacing}` : 'medium';
  const width = Math.min(1200, Math.max(80, Number(attrs.width) || 0)) || undefined;
  const height = Math.min(2000, Math.max(40, Number(attrs.height) || 0)) || undefined;

  const styleParts: string[] = [];
  if (width) styleParts.push(`width:${width}px`);
  if (height && attrs.lockAspectRatio === false) styleParts.push(`height:${height}px`);
  else styleParts.push('height:auto');
  styleParts.push('max-width:100%');

  let img = `<img src="${escapeHtml(src)}" alt="${alt}" class="ec-img" style="${styleParts.join(';')}" loading="lazy" />`;

  if (attrs.href) {
    const link = sanitizeLinkUrl(`${attrs.href}`);
    if (link.ok) {
      const la = linkAttrs(link.href);
      const attrStr = Object.entries(la)
        .map(([k, v]) => `${k}="${escapeHtml(v)}"`)
        .join(' ');
      img = `<a ${attrStr}>${img}</a>`;
    }
  }

  const captionHtml = caption ? `<figcaption>${caption}</figcaption>` : '';
  return `<figure class="ec-figure ec-layout-${layout} ec-align-${align} ec-spacing-${spacing}" data-layout="${layout}" data-align="${align}">${img}${captionHtml}</figure>`;
}

function renderNode(node: TipTapNode, ctx: { headingIndex: number }): string {
  if (!node || !node.type) return '';

  switch (node.type) {
    case 'doc':
      return (node.content || []).map((child) => renderNode(child, ctx)).join('');
    case 'paragraph': {
      const style = getTextAlignStyle(node.attrs);
      const inner = renderInline(node.content);
      return `<p${style ? ` style="${style}"` : ''}>${inner || '<br />'}</p>`;
    }
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(node.attrs?.level) || 2));
      const style = getTextAlignStyle(node.attrs);
      const text = stripText(node);
      const id = `h${level}-${slugifyHeading(text)}-${ctx.headingIndex++}`;
      const inner = renderInline(node.content);
      return `<h${level} id="${id}"${style ? ` style="${style}"` : ''}>${inner}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</ol>`;
    case 'taskList':
      return `<ul class="ec-task-list" data-type="taskList">${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</ul>`;
    case 'listItem':
      return `<li>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</li>`;
    case 'taskItem': {
      const checked = Boolean(node.attrs?.checked);
      return `<li class="ec-task-item" data-checked="${checked}" data-type="taskItem"><label><input type="checkbox" disabled ${checked ? 'checked' : ''} /> <span>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</span></label></li>`;
    }
    case 'blockquote':
      return `<blockquote>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</blockquote>`;
    case 'codeBlock': {
      const code = escapeHtml((node.content || []).map((n) => n.text || '').join(''));
      return `<pre><code>${code}</code></pre>`;
    }
    case 'horizontalRule':
      return '<hr />';
    case 'hardBreak':
      return '<br />';
    case 'table':
      return `<table><tbody>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</tbody></table>`;
    case 'tableRow':
      return `<tr>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</tr>`;
    case 'tableHeader': {
      const colspan = Number(node.attrs?.colspan) > 1 ? ` colspan="${node.attrs?.colspan}"` : '';
      const rowspan = Number(node.attrs?.rowspan) > 1 ? ` rowspan="${node.attrs?.rowspan}"` : '';
      return `<th${colspan}${rowspan}>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</th>`;
    }
    case 'tableCell': {
      const colspan = Number(node.attrs?.colspan) > 1 ? ` colspan="${node.attrs?.colspan}"` : '';
      const rowspan = Number(node.attrs?.rowspan) > 1 ? ` rowspan="${node.attrs?.rowspan}"` : '';
      return `<td${colspan}${rowspan}>${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</td>`;
    }
    case 'image':
      return renderImage(node);
    case 'youtube': {
      const src = `${node.attrs?.src || ''}`;
      const id = getYoutubeId(src) || `${node.attrs?.videoId || ''}`.trim();
      if (!id) return '';
      const title = escapeHtml(`${node.attrs?.title || 'YouTube video'}`);
      return `<div class="ec-embed ec-youtube"><iframe src="https://www.youtube.com/embed/${escapeHtml(id)}" title="${title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`;
    }
    case 'callout': {
      const variant = ['info', 'warning', 'success', 'danger'].includes(`${node.attrs?.variant}`)
        ? `${node.attrs?.variant}`
        : 'info';
      return `<aside class="ec-callout ec-callout-${variant}" data-type="callout" data-variant="${variant}">${(node.content || []).map((child) => renderNode(child, ctx)).join('')}</aside>`;
    }
    case 'text':
      return renderMarks(node.text || '', node.marks);
    default:
      if (Array.isArray(node.content)) {
        return node.content.map((child) => renderNode(child, ctx)).join('');
      }
      return '';
  }
}

/** Client-side TipTap JSON → HTML for preview (mirrors server/content/renderer.js). */
export function renderBlogContentHtml(doc: TipTapNode | null | undefined): string {
  if (!doc || typeof doc !== 'object' || doc.type !== 'doc') return '';
  return renderNode(doc, { headingIndex: 1 });
}

export function emptyDoc(): TipTapNode {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

export function isEmptyDoc(doc: TipTapNode | null | undefined): boolean {
  if (!doc || doc.type !== 'doc') return true;
  return !stripText(doc).trim();
}

export { stripText };
