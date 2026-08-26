import React, { useCallback, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link2,
  Strikethrough,
  Underline as UnderlineIcon,
} from 'lucide-react';
import { LinkPopover } from './LinkPopover';

export interface BubbleToolbarProps {
  editor: Editor;
}

const BUBBLE_MENU_OPTIONS = { placement: 'top' } as const;

function Btn({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ec-tb-btn${pressed ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);

  const shouldShow = useCallback(({ editor: ed, state }: { editor: Editor; state: { selection: { empty: boolean } } }) => {
    const { empty } = state.selection;
    if (empty) return false;
    if (ed.isActive('image') || ed.isActive('youtube')) return false;
    return true;
  }, []);

  const active = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      bold: ed.isActive('bold'),
      italic: ed.isActive('italic'),
      underline: ed.isActive('underline'),
      strike: ed.isActive('strike'),
      code: ed.isActive('code'),
      highlight: ed.isActive('highlight'),
      link: ed.isActive('link'),
      alignLeft: ed.isActive({ textAlign: 'left' }),
      alignCenter: ed.isActive({ textAlign: 'center' }),
      alignRight: ed.isActive({ textAlign: 'right' }),
      justify: ed.isActive({ textAlign: 'justify' }),
    }),
  });

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="textBubble"
      options={BUBBLE_MENU_OPTIONS}
      shouldShow={shouldShow}
      className="ec-bubble ec-text-bubble"
    >
      <div className="ec-tb-group" role="group" aria-label="Text formatting">
        <Btn
          label="Bold"
          pressed={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </Btn>
        <Btn
          label="Italic"
          pressed={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </Btn>
        <Btn
          label="Underline"
          pressed={active.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </Btn>
        <Btn
          label="Strikethrough"
          pressed={active.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={14} />
        </Btn>
        <Btn
          label="Code"
          pressed={active.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={14} />
        </Btn>
        <Btn
          label="Highlight"
          pressed={active.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter size={14} />
        </Btn>
        <Btn
          label="Link"
          pressed={active.link || linkOpen}
          onClick={() => setLinkOpen(true)}
        >
          <Link2 size={14} />
        </Btn>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Alignment">
        <Btn
          label="Align left"
          pressed={active.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={14} />
        </Btn>
        <Btn
          label="Align center"
          pressed={active.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={14} />
        </Btn>
        <Btn
          label="Align right"
          pressed={active.alignRight}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={14} />
        </Btn>
        <Btn
          label="Justify"
          pressed={active.justify}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <AlignJustify size={14} />
        </Btn>
      </div>

      {linkOpen ? (
        <div className="ec-toolbar-popover">
          <LinkPopover editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
        </div>
      ) : null}
    </BubbleMenu>
  );
}

export default BubbleToolbar;
