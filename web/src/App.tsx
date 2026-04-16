import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
import { WebSocketProvider } from './contexts/WebSocketContext'
import { NotificationProvider } from './contexts/NotificationContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Items from './pages/Items'
import ItemDetail from './pages/ItemDetail'
import Warehouses from './pages/Warehouses'
import Locations from './pages/Locations'
import IssuedTo from './pages/IssuedTo'
import Units from './pages/Units'
import Users from './pages/Users'
import Receive from './pages/movements/Receive'
import Transfer from './pages/movements/Transfer'
import Issue from './pages/movements/Issue'
import Return from './pages/movements/Return'
import Import from './pages/Import'
import AuditLog from './pages/AuditLog'
import Reports from './pages/Reports'
import UnitHistory from './pages/UnitHistory'

function AppWithProviders() {
  return (
    <WebSocketProvider>
      <NotificationProvider>
        <Toaster position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/items" element={<Items />} />
              <Route path="/items/:id" element={<ItemDetail />} />
              <Route path="/warehouses" element={<Warehouses />} />
              <Route path="/warehouses/:id/locations" element={<Locations />} />
              <Route path="/issued-to" element={<IssuedTo />} />
              <Route path="/units" element={<Units />} />
              <Route path="/units/:unitId/history" element={<UnitHistory />} />
              <Route path="/users" element={<Users />} />
              <Route path="/movements/receive" element={<Receive />} />
              <Route path="/movements/transfer" element={<Transfer />} />
              <Route path="/movements/issue" element={<Issue />} />
              <Route path="/movements/return" element={<Return />} />
              <Route path="/import" element={<Import />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/reports" element={<Reports />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </NotificationProvider>
    </WebSocketProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppWithProviders />
      </AuthProvider>
    </BrowserRouter>
  )
}


