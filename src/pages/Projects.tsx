import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProject } from '@/context/ProjectContext'
import type { Project, RecapBrief } from '@/types'

// ─── Mocked project list (replaced by real DB calls in Phase 2) ───────────────
const MOCK_PROJECTS: Project[] = [
  {
    id: 'mock-1',
    name: 'April 2026 Webinar Recap',
    status: 'draft',
    recap_brief: null,
    target_runtime_seconds: 300,
    sync_offset_ms: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

export default function ProjectsPage() {
  const { setActiveProject } = useProject()
  const navigate = useNavigate()

  const [projects, setProjects] = useState<Project[]>(MOCK_PROJECTS)
  const [showForm, setShowForm] = useState(false)

  // New-project form state
  const [name, setName] = useState('')
  const [targetMins, setTargetMins] = useState('5')
  const [desiredOutcome, setDesiredOutcome] = useState('')
  const [topicsEmphasis, setTopicsEmphasis] = useState('')
  const [topicsAvoid, setTopicsAvoid] = useState('')
  const [ctaText, setCtaText] = useState('')

  function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const brief: RecapBrief = {
      desired_outcome: desiredOutcome,
      topics_to_emphasize: topicsEmphasis.split(',').map(t => t.trim()).filter(Boolean),
      topics_to_avoid: topicsAvoid.split(',').map(t => t.trim()).filter(Boolean),
      cta_outro_text: ctaText || undefined,
    }
    const project: Project = {
      id: `mock-${Date.now()}`,
      name,
      status: 'draft',
      recap_brief: brief,
      target_runtime_seconds: Number(targetMins) * 60,
      sync_offset_ms: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setProjects(prev => [project, ...prev])
    setActiveProject(project)
    setShowForm(false)
    navigate('/import')
  }

  function handleOpen(project: Project) {
    setActiveProject(project)
    navigate('/import')
  }

  return (
    <>
      <div className="page-title">Projects</div>
      <div className="page-subtitle">
        Each project is one webinar recap. Select an existing project or create a new one.
      </div>

      <div className="mock-banner">
        ⚠ Phase 1 — projects are stored in memory only. Real Supabase persistence ships in Phase 2.
      </div>

      <div className="row" style={{ marginBottom: 20 }}>
        <div className="spacer" />
        <button onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New Project'}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-title">New Project</div>
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <label>Project name *</label>
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="May 2026 Webinar Recap"
              />
            </div>
            <div className="form-row">
              <label>Target runtime (minutes)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={targetMins}
                onChange={e => setTargetMins(e.target.value)}
              />
            </div>
            <div className="form-row">
              <label>Desired outcome — what should viewers take away?</label>
              <textarea
                value={desiredOutcome}
                onChange={e => setDesiredOutcome(e.target.value)}
                placeholder="Viewers should feel informed about our Q2 roadmap and excited about the new feature launch."
              />
            </div>
            <div className="form-row">
              <label>Topics to emphasise (comma-separated)</label>
              <input
                value={topicsEmphasis}
                onChange={e => setTopicsEmphasis(e.target.value)}
                placeholder="product demo, customer Q&A, roadmap"
              />
            </div>
            <div className="form-row">
              <label>Topics to avoid (comma-separated)</label>
              <input
                value={topicsAvoid}
                onChange={e => setTopicsAvoid(e.target.value)}
                placeholder="pricing, internal issues"
              />
            </div>
            <div className="form-row">
              <label>CTA / outro text (optional)</label>
              <input
                value={ctaText}
                onChange={e => setCtaText(e.target.value)}
                placeholder="Register for next month's webinar at example.com/webinar"
              />
            </div>
            <div className="row">
              <div className="spacer" />
              <button type="submit">Create &amp; Continue →</button>
            </div>
          </form>
        </div>
      )}

      {projects.length === 0 && !showForm && (
        <div className="empty-state">
          <h3>No projects yet</h3>
          <p>Create your first project to get started.</p>
          <button onClick={() => setShowForm(true)}>+ New Project</button>
        </div>
      )}

      {projects.map(project => (
        <div className="card" key={project.id} style={{ cursor: 'pointer' }} onClick={() => handleOpen(project)}>
          <div className="row">
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>{project.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                Created {new Date(project.created_at).toLocaleDateString()} ·{' '}
                {project.target_runtime_seconds ? `${project.target_runtime_seconds / 60} min target` : 'No target runtime'}
              </div>
            </div>
            <div className="spacer" />
            <span className={`pill ${project.status}`}>{project.status}</span>
          </div>
          {project.recap_brief?.desired_outcome && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              {project.recap_brief.desired_outcome}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
