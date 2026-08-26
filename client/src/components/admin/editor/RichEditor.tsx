import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import { createEditorExtensions } from './extensions';
import { createSlashCommandExtension } from './SlashCommand';
import { EditorToolbar } from './EditorToolbar';
import { BubbleToolbar } from './BubbleToolbar';
import { ImageBubbleMenu } from './ImageBubbleMenu';
import { emptyDoc as emptyDocHelper, renderBlogContentHtml } from '../../../lib/renderBlogContent';

export interface EditorChangePayload {
  json: JSONContent;
  html: string;
  text: string;
  wordCount: number;
  characterCount: number;
}

export interface RichEditorProps {
  content?: JSONContent | null;
  onChange?: (payload: EditorChangePayload) => void;
  onRequestImage?: (mode?: 'insert' | 'replace') => void;
  editable?: boolean;
  className?: string;
}

export interface RichEditorHandle {
  insertImage: (attrs: {
    src: string;
    alt?: string;
    caption?: string;
    width?: number;
    height?: number;
  }) => void;
  replaceImage: (attrs: {
    src: string;
    alt?: string;
    caption?: string;
    width?: number;
    height?: number;
  }) => void;
  getJSON: () => JSONContent;
  getEditor: () => Editor | null;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

export function emptyDoc(): JSONContent {
  return emptyDocHelper() as JSONContent;
}

export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { content, onChange, onRequestImage, editable = true, className = '' },
  ref,
) {
  const imageModeRef = useRef<'insert' | 'replace'>('insert');
  const onChangeRef = useRef(onChange);
  const onRequestImageRef = useRef(onRequestImage);
  onChangeRef.current = onChange;
  onRequestImageRef.current = onRequestImage;

  const extensions = useMemo(
    () =>
      createEditorExtensions({
        slashExtension: createSlashCommandExtension(() => {
          imageModeRef.current = 'insert';
          onRequestImageRef.current?.('insert');
        }),
      }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: content && content.type === 'doc' ? content : emptyDoc(),
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'blog-prose ec-editor-content focus:outline-none',
        spellcheck: 'true',
        lang: 'en',
      },
    },
    onUpdate: ({ editor: ed }) => {
      const json = ed.getJSON();
      const text = ed.getText();
      onChangeRef.current?.({
        json,
        html: renderBlogContentHtml(json),
        text,
        wordCount: countWords(text),
        characterCount: text.length,
      });
    },
  });

  useImperativeHandle(
    ref,
    () => ({
      insertImage: (attrs) => {
        if (!editor) return;
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src: attrs.src,
              alt: attrs.alt || '',
              caption: attrs.caption || '',
              width: attrs.width || 480,
              height: attrs.height || null,
              layout: 'inline',
              align: 'center',
              spacing: 'medium',
              lockAspectRatio: true,
              href: '',
            },
          })
          .run();
      },
      replaceImage: (attrs) => {
        if (!editor) return;
        if (editor.isActive('image')) {
          editor
            .chain()
            .focus()
            .updateAttributes('image', {
              src: attrs.src,
              ...(attrs.alt !== undefined ? { alt: attrs.alt } : {}),
              ...(attrs.caption !== undefined ? { caption: attrs.caption } : {}),
              ...(attrs.width ? { width: attrs.width } : {}),
              ...(attrs.height ? { height: attrs.height } : {}),
            })
            .run();
          return;
        }
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'image',
            attrs: {
              src: attrs.src,
              alt: attrs.alt || '',
              caption: attrs.caption || '',
              width: attrs.width || 480,
              height: attrs.height || null,
              layout: 'inline',
              align: 'center',
              spacing: 'medium',
              lockAspectRatio: true,
              href: '',
            },
          })
          .run();
      },
      getJSON: () => editor?.getJSON() || emptyDoc(),
      getEditor: () => editor,
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor || !content) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
  }, [editor, content]);

  const handleRequestImage = useCallback((mode: 'insert' | 'replace' = 'insert') => {
    imageModeRef.current = mode;
    onRequestImageRef.current?.(mode);
  }, []);

  const handleReplaceImage = useCallback(() => {
    handleRequestImage('replace');
  }, [handleRequestImage]);

  return (
    <div className={`ec-editor ${className}`.trim()}>
      {editable ? (
        <EditorToolbar editor={editor} onRequestImage={() => handleRequestImage('insert')} />
      ) : null}
      {editor && editable ? (
        <>
          <BubbleToolbar editor={editor} />
          <ImageBubbleMenu editor={editor} onReplace={handleReplaceImage} />
        </>
      ) : null}
      <div className="ec-editor-canvas">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
});

export default RichEditor;
