import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from '@/components/Layout'
import ProjectsPage from '@/pages/Projects'
import ImportPage from '@/pages/Import'
import SyncPage from '@/pages/Sync'
import TranscriptPage from '@/pages/Transcript'
import HighlightsPage from '@/pages/Highlights'
import RenderPage from '@/pages/Render'
import { ProjectProvider } from '@/context/ProjectContext'

export default function App() {
  return (
    <ProjectProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/sync" element={<SyncPage />} />
          <Route path="/transcript" element={<TranscriptPage />} />
          <Route path="/highlights" element={<HighlightsPage />} />
          <Route path="/render" element={<RenderPage />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </Layout>
    </ProjectProvider>
  )
}
