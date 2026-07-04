import { useState } from 'preact/hooks';
import type { ContentType } from '../lib/content-types';
import BodyEditor from './BodyEditor';
import { uploadImage } from '../lib/upload-client';

interface FormPost {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  pubDate: string; // yyyy-MM-ddTHH:mm
  draft: boolean;
  heroImage?: string;
  format?: 'md' | 'html';
  body: string;
}

interface Props {
  type: ContentType;
  initial: Partial<FormPost>;
  isNew: boolean;
}

function toLocalInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostForm({ type, initial, isNew }: Props) {
  const [id, setId] = useState(initial.id ?? '');
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [tags, setTags] = useState((initial.tags ?? []).join(', '));
  const [pubDate, setPubDate] = useState(toLocalInput(initial.pubDate));
  const [draft, setDraft] = useState(initial.draft ?? false);
  const [heroImage, setHeroImage] = useState(initial.heroImage ?? '');
  const [body, setBody] = useState(initial.body ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingHero, setUploadingHero] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // 移行分（microCMS の生HTML）は WYSIWYG に食わせず textarea で編集する
  const format: 'md' | 'html' = initial.format ?? 'md';
  const isHtml = format === 'html';

  // diary は1日1本。id は公開日(JST wall-clock)から自動生成し、スラッグ欄は隠す。
  const isDiary = type === 'diary';
  const effectiveId = isDiary ? pubDate.slice(0, 10) : id;

  async function onHeroUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    setUploadingHero(true);
    setMessage(null);
    try {
      const url = await uploadImage(file, type);
      setHeroImage(url);
    } catch (err: any) {
      setMessage(`⚠️ ${err.message}`);
    } finally {
      setUploadingHero(false);
      input.value = '';
    }
  }

  async function onSubmit(e: Event) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          isNew,
          post: {
            id: effectiveId,
            title,
            description: description || undefined,
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            pubDate: new Date(pubDate).toISOString(),
            draft,
            heroImage: heroImage || undefined,
            format,
            body,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存に失敗しました');
      setMessage('✅ 保存しました（astro-blog に commit 済み）');
      if (isNew) setTimeout(() => (location.href = `/edit/${type}/${effectiveId}`), 600);
    } catch (err: any) {
      setMessage(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      {isDiary ? (
        <>
          <label>スラッグ（公開日から自動・1日1本）</label>
          <input value={effectiveId} disabled />
        </>
      ) : (
        <>
          <label>スラッグ（ファイル名 id）</label>
          <input
            value={id}
            disabled={!isNew}
            required
            placeholder="例: my-first-post"
            onInput={(e) => setId((e.target as HTMLInputElement).value)}
          />
        </>
      )}

      <label>タイトル</label>
      <input value={title} required onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />

      <label>説明（任意）</label>
      <input value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />

      <label>タグ（カンマ区切り）</label>
      <input value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} />

      <label>公開日時</label>
      <input type="datetime-local" value={pubDate} onInput={(e) => setPubDate((e.target as HTMLInputElement).value)} />

      <label>ヒーロー画像URL（任意・R2など）</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          value={heroImage}
          style={{ flex: 1 }}
          placeholder="https://images.kechiiiiin.com/..."
          onInput={(e) => setHeroImage((e.target as HTMLInputElement).value)}
        />
        <label style={{ margin: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onHeroUpload} />
          <span
            style={{
              display: 'inline-block',
              padding: '0.4rem 0.75rem',
              border: '1px solid #8886',
              borderRadius: '4px',
              fontSize: '0.85rem',
            }}
          >
            {uploadingHero ? 'アップ中…' : '📷 写真を選択'}
          </span>
        </label>
      </div>
      {heroImage && (
        <img src={heroImage} alt="" style={{ maxHeight: '120px', marginTop: '0.4rem', borderRadius: '4px' }} />
      )}

      <label>
        <input
          type="checkbox"
          checked={draft}
          style={{ width: 'auto', marginRight: '0.4rem' }}
          onChange={(e) => setDraft((e.target as HTMLInputElement).checked)}
        />
        下書き（draft）
      </label>

      {isHtml ? (
        <>
          <label>本文（HTML・microCMS移行記事）</label>
          <p style={{ fontSize: '0.85rem', color: '#b45309', margin: '0 0 0.4rem' }}>
            ⚠️ microCMS 移行記事です。HTML のまま編集されます（WYSIWYG では開きません）。
          </p>
          <textarea value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />
        </>
      ) : (
        <>
          <label>本文（画像は D&D でアップロードできます）</label>
          <BodyEditor initialValue={body} contentType={type} onChange={setBody} />
        </>
      )}

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="submit" disabled={saving} style={{ minHeight: '44px' }}>{saving ? '保存中…' : '保存して commit'}</button>
        <a href="/posts">← 一覧へ</a>
        {message && <span>{message}</span>}
      </div>
    </form>
  );
}
