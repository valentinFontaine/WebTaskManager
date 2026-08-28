/**
 * Header component - Application navigation and branding
 * @returns {JSX.Element}
 */
export default function Header() {
  return (
    <header className="app-header">
      <div className="header-brand">
        <h1>TaskWarrior Web UI</h1>
      </div>

      <nav className="header-nav">
        <ul className="nav-list">
          <li className="nav-item">
            <a href="/" className="nav-link">
              Tasks
            </a>
          </li>
          <li className="nav-item">
            <a href="/calendar-planner.html" className="nav-link">
              Calendar
            </a>
          </li>
          <li className="nav-item">
            <a href="/day-planner.html" className="nav-link">
              Day Planner
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
