import React, { useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { sanitizeLinkUrl } from '../../../lib/linkUtils';

export interface LinkPopoverProps {
  editor: Editor;
  open: boolean;
  onClose: () => void;
  /** Optional initial URL (e.g. when editing an image link). */
  initialUrl?: string;
  /** When set, apply/remove against this callback instead of text link marks. */
  mode?: 'text' | 'custom';
  onApplyCustom?: (href: string) => void;
  onRemoveCustom?: () => void;
}

export function LinkPopover({
  editor,
  open,
  onClose,
  initialUrl,
  mode = 'text',
  onApplyCustom,
  onRemoveCustom,
}: LinkPopoverProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const existing =
      initialUrl ??
      (mode === 'text' ? `${editor.getAttributes('link').href || ''}` : '');
    setUrl(existing);
    setError('');
    setCopied(false);
    const t = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(t);
  }, [open, editor, initialUrl, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const apply = () => {
    const result = sanitizeLinkUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (mode === 'custom') {
      onApplyCustom?.(result.href);
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: result.href }).run();
    }
    onClose();
  };

  const remove = () => {
    if (mode === 'custom') {
      onRemoveCustom?.();
    } else {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
    }
    onClose();
  };

  const openLink = () => {
    const result = sanitizeLinkUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    window.open(result.href, '_blank', 'noopener,noreferrer');
  };

  const copyLink = async () => {
    const result = sanitizeLinkUrl(url);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    try {
      await navigator.clipboard.writeText(result.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Unable to copy to clipboard.');
    }
  };

  return (
    <div
      className="ec-link-popover"
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-label`}
    >
      <label id={`${id}-label`} htmlFor={`${id}-url`} className="ec-link-label">
        Link URL
      </label>
      <input
        id={`${id}-url`}
        ref={inputRef}
        type="url"
        className="ec-link-input"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
        placeholder="https://… or /path or #anchor"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? (
        <p id={`${id}-error`} className="ec-link-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="ec-link-actions">
        <button type="button" className="ec-btn ec-btn-primary" onClick={apply}>
          Apply
        </button>
        <button type="button" className="ec-btn" onClick={remove}>
          Remove
        </button>
        <button type="button" className="ec-btn" onClick={openLink}>
          Open
        </button>
        <button type="button" className="ec-btn" onClick={copyLink}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="ec-btn" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default LinkPopover;
