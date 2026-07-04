/**
 * 空行保持のための HTML ↔ Markdown roundtrip ユーティリティ。
 *
 * 背景:
 *   Toast UI Editor の getMarkdown() は空段落 <p><br></p> を通常の段落区切り "\n\n" に潰してしまい
 *   空行の情報が失われる（原因① の主因・実測確認済み）。
 *   <p>&nbsp;</p>（U+00A0）に置換してから getMarkdown() すると "A\n \nB"（nbsp 行）として
 *   Markdown に保存でき、setMarkdown() で完全復元できる（roundtrip 安定・実測確認済み）。
 *
 * これらの関数はその変換対称ペア。astro-blog 側の remark-blank-lines.ts が表示側の逆変換を担う。
 */

/**
 * WYSIWYG HTML の空段落を U+00A0 段落に変換する（保存前処理）。
 * <p><br></p> → <p>&nbsp;</p>
 *
 * getMarkdown() の前に呼ぶことで、空行が "nbsp 行" として Markdown に保存される。
 * ライブエディタ本体には適用しないこと（カーソル・IME が壊れる）。隠し変換用エディタのみに使う。
 */
export function markBlankParagraphs(html: string): string {
  // <br/> や空白入りなど出力形の揺れに耐えるよう正規表現で吸収する
  return html.replace(/<p><br\s*\/?><\/p>/g, '<p>&nbsp;</p>');
}

/**
 * U+00A0 段落を編集可能な素の空段落に戻す（編集開始時の正規化）。
 * <p>&nbsp;</p> および <p> </p>（U+00A0 が文字参照ではなくリテラルで入るケース）→ <p><br></p>
 *
 * 既存記事を開いたとき nbsp 行が <p>&nbsp;</p> として復元されるが、
 * そのままだと行に文字を入力した際に不可視の U+00A0 が混入する。
 * init 直後に1回だけ呼ぶことで「入力 = 常に <p><br></p> 経路」に揃える。
 */
export function unmarkBlankParagraphs(html: string): string {
  return html
    .replaceAll('<p>&nbsp;</p>', '<p><br></p>')
    .replaceAll('<p> </p>', '<p><br></p>');
}
