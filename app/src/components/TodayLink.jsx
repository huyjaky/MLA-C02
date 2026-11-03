import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

/** Big link tile: icon, small label, the value, optional extra content. */
export function TodayLink({ to, icon: Icon, label, value, children, primary = false }) {
  return (
    <Link to={to} className={`today__item ${primary ? 'today__item--primary' : ''}`}>
      <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {children}
      </span>
      <ArrowRight size={18} className="today__go" aria-hidden="true" />
    </Link>
  )
}
