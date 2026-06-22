import { useState } from 'preact/hooks';
import type { ContentType } from '../lib/content-types';

interface FormPost {
  id: string;
  title: string;
  description?: string;
  tags: string[];
  pubDate: string; // yyyy-MM-ddTHH:mm
  draft: boolean;
  heroImage?: string;
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
  const [message, setMessage] = useState<string | null>(null);

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
          post: {
            id,
            title,
            description: description || undefined,
            tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
            pubDate: new Date(pubDate).toISOString(),
            draft,
            heroImage: heroImage || undefined,
            body,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? '保存に失敗しました');
      setMessage('✅ 保存しました（astro-blog に commit 済み）');
      if (isNew) setTimeout(() => (location.href = `/edit/${type}/${id}`), 600);
    } catch (err: any) {
      setMessage(`⚠️ ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <label>スラッグ（ファイル名 id）</label>
      <input
        value={id}
        disabled={!isNew}
        required
        placeholder="例: my-first-post"
        onInput={(e) => setId((e.target as HTMLInputElement).value)}
      />

      <label>タイトル</label>
      <input value={title} required onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />

      <label>説明（任意）</label>
      <input value={description} onInput={(e) => setDescription((e.target as HTMLInputElement).value)} />

      <label>タグ（カンマ区切り）</label>
      <input value={tags} onInput={(e) => setTags((e.target as HTMLInputElement).value)} />

      <label>公開日時</label>
      <input type="datetime-local" value={pubDate} onInput={(e) => setPubDate((e.target as HTMLInputElement).value)} />

      <label>ヒーロー画像URL（任意・R2など）</label>
      <input value={heroImage} onInput={(e) => setHeroImage((e.target as HTMLInputElement).value)} />

      <label>
        <input
          type="checkbox"
          checked={draft}
          style={{ width: 'auto', marginRight: '0.4rem' }}
          onChange={(e) => setDraft((e.target as HTMLInputElement).checked)}
        />
        下書き（draft）
      </label>

      <label>本文（Markdown）</label>
      <textarea value={body} onInput={(e) => setBody((e.target as HTMLTextAreaElement).value)} />

      <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button type="submit" disabled={saving}>{saving ? '保存中…' : '保存して commit'}</button>
        <a href="/">← 一覧へ</a>
        {message && <span>{message}</span>}
      </div>
    </form>
  );
}
