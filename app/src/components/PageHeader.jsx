/** Page title block shared by every route. */
export function PageHeader({ title, lead, aside, children }) {
  return (
    <header className="page-header">
      <div className="page-header__text">
        <h1>{title}</h1>
        {lead && <p className="page-header__lead">{lead}</p>}
        {children}
      </div>
      {aside && <div className="page-header__aside">{aside}</div>}
    </header>
  )
}
