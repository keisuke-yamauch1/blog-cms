import { useEffect, useRef } from 'preact/hooks';

interface Props {
  initialValue: string;
  contentType: string; // 画像アップ先プレフィックス（blog/diary/emonicle）
  onChange: (markdown: string) => void;
}

// Toast UI Editor（WYSIWYG）。SSR で評価させないため useEffect 内で動的 import する。
export default function BodyEditor({ initialValue, contentType, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      const { default: Editor } = await import('@toast-ui/editor'); // クライアントのみで読む
      await import('@toast-ui/editor/dist/toastui-editor.css');
      if (disposed || !ref.current) return;
      editorRef.current = new Editor({
        el: ref.current,
        initialEditType: 'wysiwyg',
        previewStyle: 'tab',
        height: '600px',
        initialValue: initialValue || '',
        usageStatistics: false,
        hooks: {
          addImageBlobHook: async (blob: Blob, callback: (url: string, alt: string) => void) => {
            const fd = new FormData();
            fd.append('file', blob);
            fd.append('type', contentType);
            try {
              const res = await fetch('/api/upload', { method: 'POST', body: fd });
              const data = await res.json();
              if (!res.ok) {
                alert(data.error ?? 'アップロードに失敗しました');
                return;
              }
              callback(data.url, '');
            } catch (e: any) {
              alert(`アップロードに失敗しました: ${e?.message ?? e}`);
            }
          },
        },
        events: {
          change: () => {
            if (editorRef.current) onChange(editorRef.current.getMarkdown());
          },
        },
      });
    })();
    return () => {
      disposed = true;
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
    // initialValue/contentType は初期化時のみ使う（再マウント不要）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} />;
}
