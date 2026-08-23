import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const DailyReport = lazy(() => import('./pages/DailyReport'))
const EfficiencyAnalysis = lazy(() => import('./pages/EfficiencyAnalysis'))
const AnomalyManagement = lazy(() => import('./pages/AnomalyManagement'))
const AIAssistant = lazy(() => import('./pages/AIAssistant'))

const pageFallback = <div className="p-8 text-sm text-slate-500">正在加载页面…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Suspense fallback={pageFallback}><Dashboard /></Suspense>} />
          <Route path="daily-report" element={<Suspense fallback={pageFallback}><DailyReport /></Suspense>} />
          <Route path="efficiency" element={<Suspense fallback={pageFallback}><EfficiencyAnalysis /></Suspense>} />
          <Route path="anomalies" element={<Suspense fallback={pageFallback}><AnomalyManagement /></Suspense>} />
          <Route path="ai-assistant" element={<Suspense fallback={pageFallback}><AIAssistant /></Suspense>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
