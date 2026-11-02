/** Standard segmented control (radio group) used for language, theme and modes. */
export function Segmented({ label, value, options, onChange }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className="segmented__option"
          onClick={() => onChange(o.value)}
          title={o.title}
        >
          {o.icon}
          {o.label && <span>{o.label}</span>}
        </button>
      ))}
    </div>
  )
}
