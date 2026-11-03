import { useId, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useApp } from '../state/AppContext'
import { useAsync } from '../state/hooks'

let mermaidModule // the library is large, so it is imported once, the first time a diagram opens
const loadMermaid = () => (mermaidModule ??= import('mermaid').then((m) => m.default))

/** Renders Mermaid source as SVG; falls back to showing the source if it does not parse. */
export function MermaidDiagram({ code, dark, label }) {
  const id = `mmd-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const rendered = useAsync(
    () =>
      loadMermaid()
        .then(async (mermaid) => {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: dark ? 'dark' : 'neutral',
            fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
          })
          await mermaid.parse(code) // throws before render can leave an error graphic in the page
          return { svg: (await mermaid.render(id, code)).svg }
        })
        .catch(() => ({ failed: true })),
    [code, dark, id],
  )

  if (!rendered) return <div className="diagram skeleton" aria-busy="true" />
  const { svg, failed } = rendered
  return (
    <div className="diagram-wrap">
      {failed ? (
        <pre className="diagram diagram--source">{code}</pre>
      ) : (
        <div className="diagram" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
      )}
      <CopyButton text={code} />
    </div>
  )
}

/** Fallback where the Clipboard API is missing or denied (plain http on a LAN IP, embedded browsers). */
function legacyCopy(text) {
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
  document.body.append(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  return ok
}

/** Copies the Mermaid source (paste into mermaid.live, Notion, GitHub...). */
function CopyButton({ text }) {
  const { l } = useApp()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    const ok = await navigator.clipboard?.writeText(text).then(() => true, () => false) || legacyCopy(text)
    if (!ok) return
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" className="diagram__copy" onClick={copy} aria-live="polite">
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {l.ui(copied ? 'summary.copied' : 'summary.copy')}
    </button>
  )
}
