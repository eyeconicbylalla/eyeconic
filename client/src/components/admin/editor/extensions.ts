import { Mark, Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Youtube from '@tiptap/extension-youtube';
import Image from '@tiptap/extension-image';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { ImageNodeView } from './ImageNodeView';
import { FONT_FAMILIES } from '../../../lib/renderBlogContent';
import type { AnyExtension } from '@tiptap/core';

export type FontFamilyKey = 'sans' | 'serif' | 'mono' | 'system';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontFamily: {
      setFontFamily: (fontFamily: FontFamilyKey | string) => ReturnType;
      unsetFontFamily: () => ReturnType;
    };
    callout: {
      setCallout: (attrs?: { variant?: string }) => ReturnType;
      toggleCallout: (attrs?: { variant?: string }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/** Custom font-family mark — persists attrs.fontFamily (sans|serif|mono|system). */
export const FontFamily = Mark.create({
  name: 'fontFamily',

  addOptions() {
    return {
      types: ['textStyle'],
    };
  },

  addAttributes() {
    return {
      fontFamily: {
        default: 'sans',
        parseHTML: (element) =>
          element.getAttribute('data-font') ||
          element.style.fontFamily ||
          'sans',
        renderHTML: (attributes) => {
          const key = `${attributes.fontFamily || 'sans'}`;
          const family = FONT_FAMILIES[key] || FONT_FAMILIES.sans;
          return {
            class: 'ec-font',
            'data-font': key,
            style: `font-family: ${family}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'span.ec-font' },
      {
        style: 'font-family',
        getAttrs: (value) => {
          if (typeof value !== 'string') return false;
          const lower = value.toLowerCase();
          if (lower.includes('georgia') || lower.includes('times')) return { fontFamily: 'serif' };
          if (lower.includes('mono') || lower.includes('consolas') || lower.includes('menlo')) {
            return { fontFamily: 'mono' };
          }
          if (lower.startsWith('system-ui')) return { fontFamily: 'system' };
          return { fontFamily: 'sans' };
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setFontFamily:
        (fontFamily) =>
        ({ commands }) =>
          commands.setMark(this.name, { fontFamily }),
      unsetFontFamily:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

/** Callout block node — attrs.variant: info | warning | success | danger. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      variant: {
        default: 'info',
        parseHTML: (el) => el.getAttribute('data-variant') || 'info',
        renderHTML: (attrs) => ({
          'data-variant': attrs.variant || 'info',
          'data-type': 'callout',
          class: `ec-callout ec-callout-${attrs.variant || 'info'}`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }, { tag: 'aside.ec-callout' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attrs || { variant: 'info' }),
      toggleCallout:
        (attrs) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attrs || { variant: 'info' }),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },
});

/** Resizable image with layout / align / caption / alt / href attrs. */
export const ResizableImage = Image.extend({
  name: 'image',
  group: 'block',
  draggable: true,
  selectable: true,
  atom: true,

  addAttributes() {
    return {
      ...this.parent?.(),
      src: { default: null },
      alt: { default: '' },
      title: { default: null },
      caption: { default: '' },
      href: { default: '' },
      width: { default: null },
      height: { default: null },
      layout: { default: 'inline' },
      align: { default: 'center' },
      spacing: { default: 'medium' },
      lockAspectRatio: { default: true },
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView, {
      className: 'ec-image-node',
    });
  },
});

export interface CreateEditorExtensionsOptions {
  placeholder?: string;
  onSlashImage?: () => void;
  slashExtension?: AnyExtension | null;
}

export function createEditorExtensions(options: CreateEditorExtensionsOptions = {}): AnyExtension[] {
  const { placeholder = 'Write your post… Type / for commands', slashExtension } = options;

  const extensions: AnyExtension[] = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      codeBlock: {},
      // TipTap 3 StarterKit ships Link + Underline — disable so we configure them explicitly.
      link: false,
      underline: false,
    }),
    Underline,
    TextAlign.configure({
      types: ['heading', 'paragraph'],
      alignments: ['left', 'center', 'right', 'justify'],
    }),
    Highlight.configure({ multicolor: false }),
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: 'ec-link',
        rel: 'noopener noreferrer nofollow',
      },
      validate: (href) => /^https?:\/\//i.test(href) || href.startsWith('/') || href.startsWith('#') || /^mailto:/i.test(href) || /^tel:/i.test(href),
    }),
    Placeholder.configure({ placeholder }),
    TaskList.configure({
      HTMLAttributes: { class: 'ec-task-list' },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: { class: 'ec-task-item' },
    }),
    Table.configure({
      resizable: true,
      HTMLAttributes: { class: 'ec-table' },
    }),
    TableRow,
    TableHeader,
    TableCell,
    Youtube.configure({
      controls: true,
      nocookie: true,
      width: '100%',
      HTMLAttributes: { class: 'ec-youtube' },
    }),
    FontFamily,
    Callout,
    ResizableImage.configure({
      allowBase64: true,
      inline: false,
    }),
  ];

  if (slashExtension) {
    extensions.push(slashExtension);
  }

  return extensions;
}

export { FONT_FAMILIES };
