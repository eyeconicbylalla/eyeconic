import React, { useState } from 'react';
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
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Youtube,
} from 'lucide-react';
import { FONT_FAMILIES, type FontFamilyKey } from './extensions';
import { LinkPopover } from './LinkPopover';

export interface EditorToolbarProps {
  editor: Editor | null;
  onRequestImage?: () => void;
  onRequestYoutube?: () => void;
}

const FONT_OPTIONS: { value: FontFamilyKey; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
  { value: 'system', label: 'System' },
];

function ToolButton({
  label,
  pressed,
  onClick,
  children,
  disabled,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ec-tb-btn${pressed ? ' is-active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TableGridPicker({ onPick }: { onPick: (rows: number, cols: number) => void }) {
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const size = 8;

  return (
    <div className="ec-table-picker" role="menu" aria-label="Insert table">
      <div className="ec-table-picker-label">
        {hover ? `${hover.r} × ${hover.c}` : 'Insert table'}
      </div>
      <div className="ec-table-grid" onMouseLeave={() => setHover(null)}>
        {Array.from({ length: size }, (_, ri) =>
          Array.from({ length: size }, (_, ci) => {
            const r = ri + 1;
            const c = ci + 1;
            const active = hover && r <= hover.r && c <= hover.c;
            return (
              <button
                key={`${r}-${c}`}
                type="button"
                className={`ec-table-cell${active ? ' is-active' : ''}`}
                aria-label={`${r} by ${c} table`}
                onMouseEnter={() => setHover({ r, c })}
                onClick={() => onPick(r, c)}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

export function EditorToolbar({ editor, onRequestImage, onRequestYoutube }: EditorToolbarProps) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [tableOpen, setTableOpen] = useState(false);

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      if (!ed) {
        return {
          currentFont: 'sans' as FontFamilyKey,
          h1: false,
          h2: false,
          h3: false,
          bold: false,
          italic: false,
          underline: false,
          strike: false,
          highlight: false,
          code: false,
          alignLeft: false,
          alignCenter: false,
          alignRight: false,
          justify: false,
          bulletList: false,
          orderedList: false,
          blockquote: false,
          link: false,
        };
      }
      return {
        currentFont: (ed.getAttributes('fontFamily').fontFamily || 'sans') as FontFamilyKey,
        h1: ed.isActive('heading', { level: 1 }),
        h2: ed.isActive('heading', { level: 2 }),
        h3: ed.isActive('heading', { level: 3 }),
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        highlight: ed.isActive('highlight'),
        code: ed.isActive('code'),
        alignLeft: ed.isActive({ textAlign: 'left' }),
        alignCenter: ed.isActive({ textAlign: 'center' }),
        alignRight: ed.isActive({ textAlign: 'right' }),
        justify: ed.isActive({ textAlign: 'justify' }),
        bulletList: ed.isActive('bulletList'),
        orderedList: ed.isActive('orderedList'),
        blockquote: ed.isActive('blockquote'),
        link: ed.isActive('link'),
      };
    },
  });

  if (!editor) return null;

  const currentFont = toolbarState.currentFont;

  return (
    <div className="ec-editor-toolbar" role="toolbar" aria-label="Formatting">
      <div className="ec-tb-group">
        <ToolButton label="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={16} />
        </ToolButton>
        <ToolButton label="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={16} />
        </ToolButton>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Headings">
        {[1, 2, 3].map((level) => (
          <ToolButton
            key={level}
            label={`Heading ${level}`}
            pressed={level === 1 ? toolbarState.h1 : level === 2 ? toolbarState.h2 : toolbarState.h3}
            onClick={() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run()}
          >
            H{level}
          </ToolButton>
        ))}
      </div>

      <div className="ec-tb-group">
        <label className="sr-only" htmlFor="ec-font-family">
          Font family
        </label>
        <select
          id="ec-font-family"
          className="ec-tb-select"
          aria-label="Font family"
          value={currentFont}
          onChange={(e) => {
            const value = e.target.value as FontFamilyKey;
            if (value === 'sans') {
              editor.chain().focus().unsetFontFamily().run();
            } else {
              editor.chain().focus().setFontFamily(value).run();
            }
          }}
          style={{ fontFamily: FONT_FAMILIES[currentFont] }}
        >
          {FONT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value} style={{ fontFamily: FONT_FAMILIES[opt.value] }}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Inline marks">
        <ToolButton
          label="Bold"
          pressed={toolbarState.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} />
        </ToolButton>
        <ToolButton
          label="Italic"
          pressed={toolbarState.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} />
        </ToolButton>
        <ToolButton
          label="Underline"
          pressed={toolbarState.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Strikethrough"
          pressed={toolbarState.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough size={16} />
        </ToolButton>
        <ToolButton
          label="Highlight"
          pressed={toolbarState.highlight}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter size={16} />
        </ToolButton>
        <ToolButton
          label="Inline code"
          pressed={toolbarState.code}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code size={16} />
        </ToolButton>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Alignment">
        <ToolButton
          label="Align left"
          pressed={toolbarState.alignLeft}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={16} />
        </ToolButton>
        <ToolButton
          label="Align center"
          pressed={toolbarState.alignCenter}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={16} />
        </ToolButton>
        <ToolButton
          label="Align right"
          pressed={toolbarState.alignRight}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={16} />
        </ToolButton>
        <ToolButton
          label="Justify"
          pressed={toolbarState.justify}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
        >
          <AlignJustify size={16} />
        </ToolButton>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Lists">
        <ToolButton
          label="Bullet list"
          pressed={toolbarState.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} />
        </ToolButton>
        <ToolButton
          label="Ordered list"
          pressed={toolbarState.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} />
        </ToolButton>
        <ToolButton
          label="Blockquote"
          pressed={toolbarState.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={16} />
        </ToolButton>
      </div>

      <div className="ec-tb-group relative">
        <ToolButton label="Insert table" pressed={tableOpen} onClick={() => setTableOpen((v) => !v)}>
          <TableIcon size={16} />
        </ToolButton>
        {tableOpen ? (
          <div className="ec-table-popover">
            <TableGridPicker
              onPick={(rows, cols) => {
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
                setTableOpen(false);
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="ec-tb-group relative">
        <ToolButton
          label="Link"
          pressed={toolbarState.link || linkOpen}
          onClick={() => setLinkOpen(true)}
        >
          <Link2 size={16} />
        </ToolButton>
        {linkOpen ? (
          <div className="ec-toolbar-popover">
            <LinkPopover editor={editor} open={linkOpen} onClose={() => setLinkOpen(false)} />
          </div>
        ) : null}
      </div>

      <div className="ec-tb-group">
        <ToolButton label="Insert image" onClick={() => onRequestImage?.()}>
          <ImageIcon size={16} />
        </ToolButton>
        <ToolButton
          label="Insert YouTube"
          onClick={() => {
            if (onRequestYoutube) {
              onRequestYoutube();
              return;
            }
            const url = window.prompt('YouTube URL');
            if (url) editor.chain().focus().setYoutubeVideo({ src: url }).run();
          }}
        >
          <Youtube size={16} />
        </ToolButton>
      </div>
    </div>
  );
}

export default EditorToolbar;
