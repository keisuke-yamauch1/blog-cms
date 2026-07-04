// Toast UI Editor (WYSIWYG) の getMarkdown() は `_` 等を `\_` にエスケープする
// (nhn/tui.editor#715、設定で無効化不可)。URL 内に混ざると GFM autolink が
// 途切れて astro-blog 側の埋め込み変換が壊れるため、URL 内のみエスケープを解除する。
const URL_TOKEN = /https?:\/\/[^\s<>"')]+/g;
const MD_ESCAPE = /\\([_*~`[\]()#+\-.!|{}])/g;

/** URL トークン内の Markdown エスケープ（`\_` 等）だけを解除する。本文の意図的な `\_` には触れない。 */
export function unescapeUrls(markdown: string): string {
  return markdown.replace(URL_TOKEN, (url) => url.replace(MD_ESCAPE, '$1'));
}
