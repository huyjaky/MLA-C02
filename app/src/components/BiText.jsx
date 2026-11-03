import { useApp } from '../state/AppContext'

/** Sanitized content HTML (cleaned at import); links open outside the app. */
function Html({ html, className, as: Tag = 'div', lang }) {
  const safe = html.replaceAll('<a ', '<a target="_blank" rel="noreferrer" ')
  return <Tag className={className} lang={lang} dangerouslySetInnerHTML={{ __html: safe }} />
}

/**
 * Renders a bilingual pair in the active language. In dual mode the other
 * language follows underneath, quieter, so both can be compared in place.
 */
export function BiText({ pair, html = false, as: Tag = html ? 'div' : 'span', className = '' }) {
  const { l, state } = useApp()
  const primary = l.text(pair)
  const secondary = state.settings.dual ? l.text(pair, l.other) : ''
  const render = (text, cls, lang) =>
    html ? <Html html={text} as={Tag} className={cls} lang={lang} /> : <Tag className={cls} lang={lang}>{text}</Tag>
  return (
    <>
      {render(primary, className, l.lang)}
      {secondary && secondary !== primary && render(secondary, `${className} bi-secondary`, l.other)}
    </>
  )
}
