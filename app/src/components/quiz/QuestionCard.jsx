import { useEffect, useRef } from 'react'
import { Flag } from 'lucide-react'
import { useApp } from '../../state/AppContext'
import { BiText } from '../BiText'
import { Stamp } from '../Stamp'

const LETTERS = 'ABCDEFGH'

/** PNG blob of an image (the Clipboard API only reliably accepts image/png). */
async function imageAsPng(img) {
  const blob = await (await fetch(img.currentSrc || img.src)).blob()
  if (blob.type === 'image/png') return blob
  const bitmap = await createImageBitmap(blob)
  const canvas = Object.assign(document.createElement('canvas'), { width: bitmap.width, height: bitmap.height })
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  return new Promise((resolve, reject) => canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('encode'))), 'image/png'))
}

/**
 * Puts a "copy image" button on every <img> inside `ref`. The images sit in content HTML
 * (dangerouslySetInnerHTML), so the buttons are added to the DOM after each render.
 */
function useCopyableImages(ref, labels) {
  useEffect(() => {
    ref.current?.querySelectorAll('img').forEach((img) => {
      if (img.parentElement.classList.contains('img-copy')) return
      const wrap = document.createElement('span')
      wrap.className = 'img-copy'
      img.replaceWith(wrap)
      wrap.append(img)
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'img-copy__btn'
      button.textContent = labels.copy
      button.addEventListener('click', async (event) => {
        event.stopPropagation()
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageAsPng(img) })])
          button.textContent = labels.copied
        } catch {
          button.textContent = labels.failed
        }
        setTimeout(() => (button.textContent = labels.copy), 1500)
      })
      wrap.append(button)
    })
  })
}

/** One question on an index card: options, then per-option feedback and the stamp once revealed. */
export function QuestionCard({ session, onChoose, onFlag }) {
  const { l } = useApp()
  const card = useRef(null)
  const q = session.current
  const picked = session.selectionOf(q)
  const revealed = session.isRevealed(q)
  useCopyableImages(card, { copy: l.ui('quiz.copyImage'), copied: l.ui('quiz.copiedImage'), failed: l.ui('quiz.copyImageFailed') })

  return (
    <article ref={card} className="question card-stock ruled" aria-labelledby={`q-${q.id}`}>
      <header className="question__head">
        <span className="num">{l.ui('quiz.questionOf', { n: session.index + 1, total: session.questions.length })}</span>
        {q.domain && <span className="question__domain">{q.domain}</span>}
        <button type="button" className="icon-btn" aria-pressed={session.flagged.has(q.id)} onClick={onFlag} title={l.ui('quiz.flag')}>
          <Flag size={16} aria-hidden="true" />
          <span className="sr-only">{l.ui('quiz.flag')}</span>
        </button>
      </header>
      {revealed && <Stamp correct={session.isCorrect(q)} />}

      <div id={`q-${q.id}`} className="question__prompt">
        <BiText pair={q.question} html />
      </div>
      {q.multi && <p className="question__hint">{l.ui('quiz.selectN', { n: q.answer.length })}</p>}

      <ul className="options" role={q.multi ? 'group' : 'radiogroup'}>
        {q.options.map((option, i) => {
          const isPicked = picked.has(i)
          const isAnswer = q.answer.includes(i)
          const verdict = revealed ? (isAnswer ? 'answer' : isPicked ? 'wrong' : 'other') : undefined
          return (
            <li key={i}>
              <button
                type="button"
                role={q.multi ? 'checkbox' : 'radio'}
                aria-checked={isPicked}
                aria-disabled={revealed}
                className="option"
                data-verdict={verdict}
                onClick={() => onChoose(i)}
              >
                <span className="option__key" aria-hidden="true">{LETTERS[i]}</span>
                <span className="option__body">
                  <BiText pair={option} html />
                  {revealed && q.feedback?.[i] && (isPicked || isAnswer) && (
                    <span className="option__feedback"><BiText pair={q.feedback[i]} html /></span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {revealed && q.explanation && (
        <section className="explanation">
          <h3>{l.ui('quiz.explanation')}</h3>
          <BiText pair={q.explanation} html />
        </section>
      )}
    </article>
  )
}
