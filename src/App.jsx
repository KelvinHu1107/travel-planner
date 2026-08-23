import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Home from './pages/Home'
import TripBoard from './pages/TripBoard'
import NoteDetail from './pages/NoteDetail'
import ChecklistPage from './pages/ChecklistPage'
import AuthPage from './pages/AuthPage'
import VersionBadge from './components/ui/VersionBadge'
import IconPickerPage from './pages/IconPickerPage'

function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth()
  if (authLoading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontSize: 52 }}>✈️</div>
      <p style={{ fontSize: 15, fontWeight: 900, color: 'var(--text-muted)' }}>載入中…</p>
    </div>
  )
  if (!currentUser) return <Navigate to="/auth" replace />
  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/trip/:tripId" element={<ProtectedRoute><TripBoard /></ProtectedRoute>} />
      <Route path="/trip/:tripId/note/:noteId" element={<ProtectedRoute><NoteDetail /></ProtectedRoute>} />
      <Route path="/trip/:tripId/todos" element={<ProtectedRoute><ChecklistPage type="todo" /></ProtectedRoute>} />
      <Route path="/trip/:tripId/packing" element={<ProtectedRoute><ChecklistPage type="packing" /></ProtectedRoute>} />
      <Route path="/icon-picker" element={<IconPickerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <VersionBadge />
      </AuthProvider>
    </BrowserRouter>
  )
}
