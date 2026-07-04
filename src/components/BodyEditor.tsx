import { useEffect, useRef, useState } from 'preact/hooks';
// CSS は静的 import（Astro/Vite が確実にページに <link> する。動的だと当たらないことがある）
import '@toast-ui/editor/dist/toastui-editor.css';
import { unescapeUrls } from '../lib/markdown-normalize';
import { markBlankParagraphs, unmarkBlankParagraphs } from '../lib/blank-lines';
import { uploadImage } from '../lib/upload-client';

interface Props {
  initialValue: string;
  contentType: string; // 画像アップ先プレフィックス（blog/diary/emonicle）
  onChange: (markdown: string) => void;
}

// Toast UI Editor（WYSIWYG）。エディタ本体の JS は DOM に触るため useEffect 内で動的 import する。
export default function BodyEditor({ initialValue, contentType, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 空行変換用の隠しエディタ（ライブエディタを setHTML すると IME・カーソルが壊れるため別インスタンスで変換する）
  const hiddenEditorRef = useRef<any>(null);
  const hiddenDivRef = useRef<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const mod = await import('@toast-ui/editor'); // クライアントのみで読む
        const Editor = (mod as any).default ?? (mod as any).Editor ?? mod;
        if (disposed || !ref.current) return;
        // window 系は useEffect 内＝クライアント限定なので安全（Workers SSR で window 不在）
        const isMobile = window.matchMedia('(max-width: 640px)').matches;
        editorRef.current = new Editor({
          el: ref.current,
          initialEditType: 'wysiwyg',
          hideModeSwitch: true,
          previewStyle: 'vertical',
          // スマホは 60vh（キーボード表示で縮む viewport 対策）、PC は従来どおり 600px
          height: isMobile ? '60vh' : '600px',
          // スマホはツールバーを1行に絞る（グループ=配列の配列で渡す。フラットだと実行時エラー）
          toolbarItems: isMobile ? [['heading', 'bold'], ['ul', 'ol'], ['link', 'quote']] : undefined,
          initialValue: initialValue || '',
          usageStatistics: false,
          hooks: {
            addImageBlobHook: async (blob: Blob, callback: (url: string, alt: string) => void) => {
              try {
                const url = await uploadImage(blob, contentType);
                callback(url, '');
              } catch (e: any) {
                alert(`アップロードに失敗しました: ${e?.message ?? e}`);
              }
            },
          },
          events: {
            change: () => {
              if (!editorRef.current) return;
              const html = editorRef.current.getHTML();
              if (!html.includes('<p><br></p>')) {
                // 空行なし: 追加コストのない通常経路
                onChange(unescapeUrls(editorRef.current.getMarkdown()));
                return;
              }
              // 空行あり: 隠し変換用エディタに markBlankParagraphs した HTML を食わせて Markdown を取得する。
              // ライブエディタ本体を setHTML すると IME・カーソルが壊れるため隠しインスタンスで処理する。
              if (!hiddenEditorRef.current) {
                // 初回: display:none の div を body に append して Toast UI をもう1つ生成
                const div = document.createElement('div');
                div.style.display = 'none';
                document.body.appendChild(div);
                hiddenDivRef.current = div;
                hiddenEditorRef.current = new Editor({
                  el: div,
                  initialEditType: 'wysiwyg',
                  hideModeSwitch: true,
                  height: '0px',
                  initialValue: '',
                  usageStatistics: false,
                });
              }
              hiddenEditorRef.current.setHTML(markBlankParagraphs(html));
              onChange(unescapeUrls(hiddenEditorRef.current.getMarkdown()));
            },
          },
        });

        // 編集開始時の正規化: 既存記事に nbsp 行（保存済み空行）が含まれる場合、
        // そのままだと行へ文字を入力したとき U+00A0 が混入する。
        // init 直後（カーソルがまだないため安全）に1回だけ素の <p><br></p> に戻す。
        const initHtml = editorRef.current?.getHTML() ?? '';
        if (initHtml.includes('&nbsp;')) {
          editorRef.current.setHTML(unmarkBlankParagraphs(initHtml));
        }
      } catch (e: any) {
        console.error('[BodyEditor] エディタ初期化に失敗:', e);
        if (!disposed) setErr(e?.message ?? String(e));
      }
    })();
    return () => {
      disposed = true;
      editorRef.current?.destroy?.();
      editorRef.current = null;
      // 隠し変換用エディタも確実に破棄して DOM をクリーンアップ
      hiddenEditorRef.current?.destroy?.();
      hiddenEditorRef.current = null;
      hiddenDivRef.current?.remove?.();
      hiddenDivRef.current = null;
    };
    // initialValue/contentType は初期化時のみ使う（再マウント不要）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「📷 写真を追加」ボタン: 選択ファイルを直列でアップロードしカーソル位置に挿入する。
  async function onPickPhotos(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length === 0) return;
    setPhotoErr(null);
    setUploading(true);
    setTotal(files.length);
    setDone(0);
    try {
      for (let i = 0; i < files.length; i++) {
        // 直列: 順序保証＋回線負荷を平準化
        const url = await uploadImage(files[i], contentType);
        editorRef.current?.exec('addImage', { imageUrl: url, altText: '' });
        setDone(i + 1);
      }
    } catch (e: any) {
      // 直列なので失敗地点で止まる。成功済みの挿入は残す。
      setPhotoErr(`アップロードに失敗しました: ${e?.message ?? e}`);
    } finally {
      setUploading(false);
      input.value = ''; // 同じ写真の再選択を許す
    }
  }

  return (
    <div>
      <div ref={ref} />
      <div class="photo-bar" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={onPickPhotos}
        />
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}>
          📷 写真を追加
        </button>
        {uploading && <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>アップロード中… {done}/{total}</span>}
        {photoErr && <span style={{ color: '#ef4444', fontSize: '0.85rem' }}>⚠️ {photoErr}</span>}
      </div>
      {err && (
        <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>
          ⚠️ エディタの読み込みに失敗しました: {err}
        </div>
      )}
    </div>
  );
}
