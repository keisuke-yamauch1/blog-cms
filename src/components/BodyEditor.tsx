import { useEffect, useRef, useState } from 'preact/hooks';
// CSS は静的 import（Astro/Vite が確実にページに <link> する。動的だと当たらないことがある）
import '@toast-ui/editor/dist/toastui-editor.css';

interface Props {
  initialValue: string;
  contentType: string; // 画像アップ先プレフィックス（blog/diary/emonicle）
  onChange: (markdown: string) => void;
}

// Toast UI Editor（WYSIWYG）。エディタ本体の JS は DOM に触るため useEffect 内で動的 import する。
export default function BodyEditor({ initialValue, contentType, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const mod = await import('@toast-ui/editor'); // クライアントのみで読む
        const Editor = (mod as any).default ?? (mod as any).Editor ?? mod;
        if (disposed || !ref.current) return;
        editorRef.current = new Editor({
          el: ref.current,
          initialEditType: 'wysiwyg',
          hideModeSwitch: true,
          previewStyle: 'vertical',
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
      } catch (e: any) {
        console.error('[BodyEditor] エディタ初期化に失敗:', e);
        if (!disposed) setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      disposed = true;
      editorRef.current?.destroy?.();
      editorRef.current = null;
    };
    // initialValue/contentType は初期化時のみ使う（再マウント不要）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div ref={ref} />
      {err && (
        <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          ⚠️ エディタの読み込みに失敗しました: {err}
        </div>
      )}
    </div>
  );
}
