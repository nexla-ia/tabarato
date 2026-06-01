import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { Toast } from './components/Toast'
import { Sidebar } from './components/Sidebar'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Couriers } from './pages/Couriers'
import { Stores } from './pages/Stores'
import { Users } from './pages/Users'
import { Orders } from './pages/Orders'

function Layout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', width: '100%' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        overflow: 'auto',
        padding: '36px 40px',
        background: '#FFFBF7',
      }}>
        <Outlet />
      </main>
    </div>
  )
}

function ProtectedRoute() {
  const { token, user } = useAuth()
  if (!token || !user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/login" replace />
  return <Outlet />
}

function GuestRoute() {
  const { token, user } = useAuth()
  if (token && user?.role === 'ADMIN') return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<GuestRoute />}>
              <Route path="/login" element={<Login />} />
            </Route>
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/orders" element={<Orders />} />
                <Route path="/couriers" element={<Couriers />} />
                <Route path="/stores" element={<Stores />} />
                <Route path="/users" element={<Users />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        <Toast />
      </ToastProvider>
    </AuthProvider>
  )
}
