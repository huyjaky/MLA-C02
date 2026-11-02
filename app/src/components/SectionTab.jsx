/** The coloured divider tab that identifies a section everywhere in the app. */
export function SectionTab({ id, size = 'md' }) {
  const hue = id === 'exam' ? 'exam' : String(((Number(id) - 1) % 12) + 1)
  return (
    <span className={`section-tab section-tab--${size}`} data-hue={hue} aria-hidden="true">
      {id === 'exam' ? 'EX' : id}
    </span>
  )
}
