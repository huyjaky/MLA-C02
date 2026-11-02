import { Link } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { PageHeader } from '../components/PageHeader'

export function NotFoundPage() {
  const { l } = useApp()
  return (
    <div className="page">
      <PageHeader title={l.ui('notFound.title')} lead={l.ui('notFound.lead')}>
        <Link to="/" className="btn btn--primary">{l.ui('nav.dashboard')}</Link>
      </PageHeader>
    </div>
  )
}
