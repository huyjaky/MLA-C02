/** Subtitle text; **term** marks a technical term kept in English, shown highlighted. */
export function CueText({ text }) {
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <mark key={i} className="term-mark">{part}</mark> : part))
}
