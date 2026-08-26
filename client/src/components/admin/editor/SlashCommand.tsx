import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion';
import tippy, { type Instance as TippyInstance } from 'tippy.js';
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type ForwardRefRenderFunction,
} from 'react';
import type { Editor, Range } from '@tiptap/core';

export type SlashItemGroup = 'Text' | 'Media' | 'Layout';

export interface SlashItem {
  title: string;
  description: string;
  group: SlashItemGroup;
  keywords?: string[];
  command: (props: { editor: Editor; range: Range }) => void;
}

export interface SlashListRef {
  onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

interface SlashListProps {
  items: SlashItem[];
  command: (item: SlashItem) => void;
}

const SlashListInner: ForwardRefRenderFunction<SlashListRef, SlashListProps> = (
  { items, command },
  ref,
) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + items.length - 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(items.length, 1));
        return true;
      }
      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  const grouped = useMemo(() => {
    const order: SlashItemGroup[] = ['Text', 'Media', 'Layout'];
    return order
      .map((group) => ({ group, items: items.filter((i) => i.group === group) }))
      .filter((g) => g.items.length);
  }, [items]);

  if (!items.length) {
    return (
      <div className="ec-slash-menu" role="listbox" aria-label="Slash commands">
        <div className="ec-slash-empty">No matches</div>
      </div>
    );
  }

  let flatIndex = -1;

  return (
    <div className="ec-slash-menu" role="listbox" aria-label="Slash commands">
      {grouped.map(({ group, items: groupItems }) => (
        <div key={group} className="ec-slash-group">
          <div className="ec-slash-group-label">{group}</div>
          {groupItems.map((item) => {
            flatIndex += 1;
            const index = flatIndex;
            return (
              <button
                key={item.title}
                type="button"
                role="option"
                aria-selected={index === selectedIndex}
                className={`ec-slash-item${index === selectedIndex ? ' is-active' : ''}`}
                onClick={() => command(item)}
              >
                <span className="ec-slash-item-title">{item.title}</span>
                <span className="ec-slash-item-desc">{item.description}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const SlashList = forwardRef(SlashListInner);

export function buildSlashItems(onRequestImage?: () => void): SlashItem[] {
  return [
    {
      title: 'Paragraph',
      description: 'Plain text block',
      group: 'Text',
      keywords: ['p', 'text'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setParagraph().run();
      },
    },
    {
      title: 'Heading 1',
      description: 'Large section heading',
      group: 'Text',
      keywords: ['h1', 'title'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run();
      },
    },
    {
      title: 'Heading 2',
      description: 'Medium section heading',
      group: 'Text',
      keywords: ['h2'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run();
      },
    },
    {
      title: 'Heading 3',
      description: 'Small section heading',
      group: 'Text',
      keywords: ['h3'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run();
      },
    },
    {
      title: 'Bullet List',
      description: 'Unordered list',
      group: 'Text',
      keywords: ['ul', 'bullets'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBulletList().run();
      },
    },
    {
      title: 'Ordered List',
      description: 'Numbered list',
      group: 'Text',
      keywords: ['ol', 'numbers'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleOrderedList().run();
      },
    },
    {
      title: 'Task List',
      description: 'Checklist with checkboxes',
      group: 'Text',
      keywords: ['todo', 'checklist'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleTaskList().run();
      },
    },
    {
      title: 'Blockquote',
      description: 'Quoted passage',
      group: 'Text',
      keywords: ['quote'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleBlockquote().run();
      },
    },
    {
      title: 'Code Block',
      description: 'Fenced code',
      group: 'Text',
      keywords: ['code', 'pre'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
      },
    },
    {
      title: 'Divider',
      description: 'Horizontal rule',
      group: 'Layout',
      keywords: ['hr', 'line'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setHorizontalRule().run();
      },
    },
    {
      title: 'Table',
      description: '3×3 table with header',
      group: 'Layout',
      keywords: ['grid'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      },
    },
    {
      title: 'Callout',
      description: 'Highlighted aside (info)',
      group: 'Layout',
      keywords: ['aside', 'note', 'info'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).setCallout({ variant: 'info' }).run();
      },
    },
    {
      title: 'Image',
      description: 'Insert an image',
      group: 'Media',
      keywords: ['img', 'photo', 'picture'],
      command: ({ editor, range }) => {
        editor.chain().focus().deleteRange(range).run();
        onRequestImage?.();
      },
    },
    {
      title: 'YouTube',
      description: 'Embed a YouTube video',
      group: 'Media',
      keywords: ['video', 'embed'],
      command: ({ editor, range }) => {
        const url = window.prompt('YouTube URL');
        if (!url) {
          editor.chain().focus().deleteRange(range).run();
          return;
        }
        editor.chain().focus().deleteRange(range).setYoutubeVideo({ src: url }).run();
      },
    },
  ];
}

export function createSlashCommandExtension(onRequestImage?: () => void) {
  const allItems = buildSlashItems(onRequestImage);

  return Extension.create({
    name: 'slashCommand',

    addOptions() {
      return {
        suggestion: {
          char: '/',
          startOfLine: false,
          allowSpaces: false,
          command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
            props.command({ editor, range });
          },
        },
      };
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          ...this.options.suggestion,
          items: ({ query }: { query: string }) => {
            const q = query.trim().toLowerCase();
            if (!q) return allItems;
            return allItems.filter((item) => {
              const hay = [item.title, item.description, ...(item.keywords || [])]
                .join(' ')
                .toLowerCase();
              return hay.includes(q);
            });
          },
          render: () => {
            let component: ReactRenderer<SlashListRef> | null = null;
            let popup: TippyInstance[] | null = null;

            return {
              onStart: (props: SuggestionProps<SlashItem>) => {
                component = new ReactRenderer(SlashList, {
                  props: {
                    items: props.items,
                    command: props.command,
                  },
                  editor: props.editor,
                });

                if (!props.clientRect) return;

                popup = tippy('body', {
                  getReferenceClientRect: props.clientRect as () => DOMRect,
                  appendTo: () => document.body,
                  content: component.element,
                  showOnCreate: true,
                  interactive: true,
                  trigger: 'manual',
                  placement: 'bottom-start',
                  theme: 'ec-slash',
                });
              },
              onUpdate: (props: SuggestionProps<SlashItem>) => {
                component?.updateProps({
                  items: props.items,
                  command: props.command,
                });
                if (popup?.[0] && props.clientRect) {
                  popup[0].setProps({
                    getReferenceClientRect: props.clientRect as () => DOMRect,
                  });
                }
              },
              onKeyDown: (props: SuggestionKeyDownProps) => {
                if (props.event.key === 'Escape') {
                  popup?.[0]?.hide();
                  return true;
                }
                return component?.ref?.onKeyDown(props) ?? false;
              },
              onExit: () => {
                popup?.[0]?.destroy();
                component?.destroy();
                popup = null;
                component = null;
              },
            };
          },
        }),
      ];
    },
  });
}
