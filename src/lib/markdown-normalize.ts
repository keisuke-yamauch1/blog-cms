// Toast UI Editor (WYSIWYG) の getMarkdown() は `_` 等を `\_` にエスケープする
// (nhn/tui.editor#715、設定で無効化不可)。URL 内に混ざると GFM autolink が
// 途切れて astro-blog 側の埋め込み変換が壊れるため、URL 内のみエスケープを解除する。
const URL_TOKEN = /https?:\/\/[^\s<>"')]+/g;
const MD_ESCAPE = /\\([_*~`[\]()#+\-.!|{}])/g;

/** URL トークン内の Markdown エスケープ（`\_` 等）だけを解除する。本文の意図的な `\_` には触れない。 */
export function unescapeUrls(markdown: string): string {
  return markdown.replace(URL_TOKEN, (url) => url.replace(MD_ESCAPE, '$1'));
}

// WYSIWYG 内で文字として打った「---」も同様に `\-\-\-` とエスケープされ、
// サイトで区切り線(<hr>)にならず文字のまま出る。行全体が区切り線パターン
// （- * _ が3つ以上・空白可）のときだけエスケープを解除して hr として効かせる。
const ESCAPED_HR_LINE = /^[ \t]*(?:\\[-*_][ \t]*){3,}$/;

/** 行全体がエスケープ済み区切り線（`\-\-\-` 等）の行だけ、バックスラッシュを外す。 */
export function unescapeHrLines(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => (ESCAPED_HR_LINE.test(line) ? line.replace(/\\/g, '') : line))
    .join('\n');
}

/** Toast UI の getMarkdown() 出力に対する正規化をまとめて適用する（BodyEditor から使う）。 */
export function normalizeToastMarkdown(markdown: string): string {
  return unescapeHrLines(unescapeUrls(markdown));
}
