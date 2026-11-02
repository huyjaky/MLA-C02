import { useApp } from '../../state/AppContext'

/** The bubble sheet: one numbered mark per question, filled as it is answered. */
export function AnswerSheet({ session, onJump }) {
  const { l } = useApp()
  return (
    <ol className="sheet" aria-label={l.ui('quiz.sheet')}>
      {session.questions.map((q, i) => {
        const revealed = session.isRevealed(q)
        const state = revealed ? (session.isCorrect(q) ? 'right' : 'wrong') : session.selectionOf(q).size ? 'filled' : 'empty'
        return (
          <li key={q.id}>
            <button
              type="button"
              className="sheet__mark num"
              data-state={state}
              data-flagged={session.flagged.has(q.id)}
              aria-current={i === session.index ? 'step' : undefined}
              aria-label={l.ui('quiz.goTo', { n: i + 1 })}
              onClick={() => onJump(i)}
            >
              {i + 1}
            </button>
          </li>
        )
      })}
    </ol>
  )
}
