import { NavLink } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { ReactNode } from 'react'

const STEPS = [
  { path: '/projects',  label: 'Projects',   num: 1 },
  { path: '/import',    label: 'Import',      num: 2 },
  { path: '/sync',      label: 'Sync',        num: 3 },
  { path: '/transcript',label: 'Transcript',  num: 4 },
  { path: '/highlights',label: 'Highlights',  num: 5 },
  { path: '/render',    label: 'Render',      num: 6 },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { activeProject } = useProject()

  return (
    <div className="app-layout">
      <header className="app-header">
        <h1>RoughCut</h1>
        {activeProject && (
          <span className="project-name">{activeProject.name}</span>
        )}
      </header>

      <nav className="step-nav">
        {STEPS.map(step => (
          <NavLink
            key={step.path}
            to={step.path}
            className={({ isActive }) => isActive ? 'active' : ''}
          >
            <span className="step-num">{step.num}</span>
            {step.label}
          </NavLink>
        ))}
      </nav>

      <main className="page-content">
        {children}
      </main>
    </div>
  )
}
