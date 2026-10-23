import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { BudgetPage } from './features/budget/BudgetPage'
import { DashboardPage } from './features/dashboard/Dashboard'
import { MyEventsPage } from './features/events/MyEvents'
import { GuestsPage } from './features/guests/GuestsPage'
import { IdeasPage } from './features/ideas/IdeasPage'
import { LandingPage } from './features/landing/LandingPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TimelinePage } from './features/timeline/TimelinePage'
import { VendorChecklistPage } from './features/vendors/VendorChecklist'
import { VendorDirectoryPage } from './features/vendors/VendorDirectory'
import { EventWizardPage } from './features/wizard/EventWizard'
import { useSettings } from './state/store'

// The AI planner UI and its planning engine load on demand.
const AiPlannerPage = lazy(() => import('./features/ai/AiPlannerPage').then((m) => ({ default: m.AiPlannerPage })))

/** Mirrors the "reduce motion" setting onto <html> so CSS can respond to it. */
function MotionPreference() {
  const { reduceMotion } = useSettings()
  useEffect(() => {
    document.documentElement.dataset.motion = reduceMotion ? 'reduced' : 'full'
  }, [reduceMotion])
  return null
}

function NotFound() {
  return <Navigate to="/app/dashboard" replace />
}

export function App() {
  return (
    <HashRouter>
      <MotionPreference />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="events" element={<MyEventsPage />} />
          <Route path="events/new" element={<EventWizardPage />} />
          <Route path="events/:id/edit" element={<EventWizardPage />} />
          <Route path="ai" element={<Suspense fallback={<p className="muted" role="status">Loading AI planner&hellip;</p>}><AiPlannerPage /></Suspense>} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="timeline" element={<TimelinePage />} />
          <Route path="vendors" element={<VendorChecklistPage />} />
          <Route path="vendors/directory" element={<VendorDirectoryPage />} />
          <Route path="ideas" element={<IdeasPage />} />
          <Route path="guests" element={<GuestsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

