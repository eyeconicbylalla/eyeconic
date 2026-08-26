import React, { useCallback, useRef } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';

const MIN_W = 80;
const MAX_W = 1200;

export function ImageNodeView(props: ReactNodeViewProps) {
  const { node, selected, updateAttributes, editor } = props;
  const {
    src,
    alt = '',
    caption = '',
    href = '',
    width,
    height,
    layout = 'inline',
    align = 'center',
    spacing = 'medium',
    lockAspectRatio = true,
  } = node.attrs as {
    src: string;
    alt?: string;
    caption?: string;
    href?: string;
    width?: number | null;
    height?: number | null;
    layout?: string;
    align?: string;
    spacing?: string;
    lockAspectRatio?: boolean;
  };

  const startRef = useRef<{ x: number; w: number; h: number; ratio: number } | null>(null);
  const displayWidth = Math.min(MAX_W, Math.max(MIN_W, Number(width) || 480));

  const onResizeStart = useCallback(
    (e: React.MouseEvent, corner: 'se' | 'sw') => {
      if (!editor.isEditable) return;
      e.preventDefault();
      e.stopPropagation();
      const startW = displayWidth;
      const startH = Number(height) || startW * 0.66;
      const ratio = startH / startW || 0.66;
      startRef.current = { x: e.clientX, w: startW, h: startH, ratio };

      const onMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const delta = corner === 'se' ? ev.clientX - startRef.current.x : startRef.current.x - ev.clientX;
        const nextW = Math.min(MAX_W, Math.max(MIN_W, Math.round(startRef.current.w + delta)));
        const nextH = lockAspectRatio
          ? Math.round(nextW * startRef.current.ratio)
          : Math.round(startRef.current.h);
        updateAttributes({ width: nextW, height: nextH });
      };

      const onUp = () => {
        startRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [displayWidth, editor.isEditable, height, lockAspectRatio, updateAttributes],
  );

  const style: React.CSSProperties = {
    width: layout === 'full-width' ? '100%' : `${displayWidth}px`,
    maxWidth: '100%',
    height: lockAspectRatio === false && height ? `${height}px` : 'auto',
  };

  const imgEl = (
    <img
      src={src}
      alt={alt || ''}
      className="ec-img"
      style={style}
      draggable={false}
    />
  );

  return (
    <NodeViewWrapper
      as="figure"
      className={[
        'ec-figure',
        `ec-layout-${layout}`,
        `ec-align-${align}`,
        `ec-spacing-${spacing}`,
        selected ? 'ec-figure--selected' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-drag-handle
      data-layout={layout}
      data-align={align}
    >
      <div className="ec-image-frame relative inline-block max-w-full">
        {href ? (
          <a href={href} onClick={(e) => e.preventDefault()} tabIndex={-1}>
            {imgEl}
          </a>
        ) : (
          imgEl
        )}
        {editor.isEditable && selected && (
          <>
            <span
              className="ec-resize-handle ec-resize-sw"
              onMouseDown={(e) => onResizeStart(e, 'sw')}
              aria-hidden
            />
            <span
              className="ec-resize-handle ec-resize-se"
              onMouseDown={(e) => onResizeStart(e, 'se')}
              aria-hidden
            />
          </>
        )}
      </div>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </NodeViewWrapper>
  );
}

export default ImageNodeView;
