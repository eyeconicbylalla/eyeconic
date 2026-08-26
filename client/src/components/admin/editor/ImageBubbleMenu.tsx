import React, { useCallback, useState } from 'react';
import { BubbleMenu } from '@tiptap/react/menus';
import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Link2,
  Lock,
  Trash2,
  Unlock,
} from 'lucide-react';
import { LinkPopover } from './LinkPopover';

export interface ImageBubbleMenuProps {
  editor: Editor;
  onReplace?: () => void;
}

const SIZE_PRESETS: { id: string; label: string; width?: number; layout?: string }[] = [
  { id: 'small', label: 'S', width: 240 },
  { id: 'medium', label: 'M', width: 480 },
  { id: 'large', label: 'L', width: 720 },
  { id: 'original', label: 'Original', width: undefined },
  { id: 'full', label: 'Full', layout: 'full-width' },
];

const IMAGE_BUBBLE_OPTIONS = { placement: 'top' } as const;

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

export function ImageBubbleMenu({ editor, onReplace }: ImageBubbleMenuProps) {
  const [advanced, setAdvanced] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [customWidth, setCustomWidth] = useState('');

  const shouldShow = useCallback(({ editor: ed }: { editor: Editor }) => ed.isActive('image'), []);

  const imageState = useEditorState({
    editor,
    selector: ({ editor: ed }) => {
      const attrs = ed.getAttributes('image') as {
        align?: string;
        layout?: string;
        spacing?: string;
        width?: number | null;
        height?: number | null;
        alt?: string;
        caption?: string;
        href?: string;
        lockAspectRatio?: boolean;
      };
      return attrs;
    },
  });

  const attrs = imageState;

  const setAttr = (patch: Record<string, unknown>) => {
    editor.chain().focus().updateAttributes('image', patch).run();
  };

  return (
    <BubbleMenu
      editor={editor}
      pluginKey="imageBubble"
      options={IMAGE_BUBBLE_OPTIONS}
      shouldShow={shouldShow}
      className="ec-bubble ec-image-bubble"
    >
      <div className="ec-tb-group" role="group" aria-label="Image align">
        <Btn label="Align left" pressed={attrs.align === 'left'} onClick={() => setAttr({ align: 'left' })}>
          <AlignLeft size={14} />
        </Btn>
        <Btn
          label="Align center"
          pressed={attrs.align === 'center'}
          onClick={() => setAttr({ align: 'center' })}
        >
          <AlignCenter size={14} />
        </Btn>
        <Btn
          label="Align right"
          pressed={attrs.align === 'right'}
          onClick={() => setAttr({ align: 'right' })}
        >
          <AlignRight size={14} />
        </Btn>
      </div>

      <div className="ec-tb-group" role="group" aria-label="Image layout">
        {(
          [
            ['inline', 'Inline'],
            ['wrap-left', 'Wrap L'],
            ['wrap-right', 'Wrap R'],
            ['full-width', 'Full'],
          ] as const
        ).map(([value, label]) => (
          <Btn
            key={value}
            label={label}
            pressed={attrs.layout === value}
            onClick={() => setAttr({ layout: value })}
          >
            {label}
          </Btn>
        ))}
      </div>

      <div className="ec-tb-group" role="group" aria-label="Image size">
        {SIZE_PRESETS.map((preset) => (
          <Btn
            key={preset.id}
            label={preset.label}
            pressed={
              preset.layout
                ? attrs.layout === 'full-width'
                : preset.width
                  ? Number(attrs.width) === preset.width
                  : !attrs.width
            }
            onClick={() => {
              if (preset.layout) {
                setAttr({ layout: 'full-width', width: null });
              } else if (preset.width) {
                setAttr({ width: preset.width, layout: attrs.layout === 'full-width' ? 'inline' : attrs.layout });
              } else {
                setAttr({ width: null, height: null });
              }
            }}
          >
            {preset.label}
          </Btn>
        ))}
      </div>

      <div className="ec-tb-group">
        <Btn
          label={attrs.lockAspectRatio === false ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
          pressed={attrs.lockAspectRatio !== false}
          onClick={() => setAttr({ lockAspectRatio: attrs.lockAspectRatio === false })}
        >
          {attrs.lockAspectRatio === false ? <Unlock size={14} /> : <Lock size={14} />}
        </Btn>
        <Btn label="Image link" pressed={Boolean(attrs.href) || linkOpen} onClick={() => setLinkOpen(true)}>
          <Link2 size={14} />
        </Btn>
        {onReplace ? (
          <Btn label="Replace image" onClick={onReplace}>
            Replace
          </Btn>
        ) : null}
        <Btn
          label="Delete image"
          onClick={() => editor.chain().focus().deleteSelection().run()}
        >
          <Trash2 size={14} />
        </Btn>
        <Btn label="Advanced" pressed={advanced} onClick={() => setAdvanced((v) => !v)}>
          More
        </Btn>
      </div>

      {advanced ? (
        <div className="ec-image-advanced">
          <label className="ec-field">
            <span>Alt text</span>
            <input
              type="text"
              value={attrs.alt || ''}
              onChange={(e) => setAttr({ alt: e.target.value })}
              placeholder="Describe the image"
            />
          </label>
          <label className="ec-field">
            <span>Caption</span>
            <input
              type="text"
              value={attrs.caption || ''}
              onChange={(e) => setAttr({ caption: e.target.value })}
              placeholder="Optional caption"
            />
          </label>
          <label className="ec-field">
            <span>Spacing</span>
            <select
              value={attrs.spacing || 'medium'}
              onChange={(e) => setAttr({ spacing: e.target.value })}
            >
              <option value="small">Small</option>
              <option value="medium">Medium</option>
              <option value="large">Large</option>
            </select>
          </label>
          <label className="ec-field">
            <span>Custom width (px)</span>
            <input
              type="number"
              min={80}
              max={1200}
              value={customWidth || attrs.width || ''}
              onChange={(e) => setCustomWidth(e.target.value)}
              onBlur={() => {
                const n = Number(customWidth);
                if (!Number.isFinite(n)) return;
                const width = Math.min(1200, Math.max(80, Math.round(n)));
                setAttr({ width });
                setCustomWidth(String(width));
              }}
            />
          </label>
        </div>
      ) : null}

      {linkOpen ? (
        <div className="ec-toolbar-popover ec-image-link-popover">
          <LinkPopover
            editor={editor}
            open={linkOpen}
            mode="custom"
            initialUrl={attrs.href || ''}
            onApplyCustom={(href) => {
              setAttr({ href });
              setLinkOpen(false);
            }}
            onRemoveCustom={() => {
              setAttr({ href: '' });
              setLinkOpen(false);
            }}
            onClose={() => setLinkOpen(false)}
          />
        </div>
      ) : null}
    </BubbleMenu>
  );
}

export default ImageBubbleMenu;
