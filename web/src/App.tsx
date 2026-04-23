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
import Units from './pages/Units'
import Users from './pages/Users'
import Import from './pages/Import'
import AuditLog from './pages/AuditLog'
import Reports from './pages/Reports'
import UnitHistory from './pages/UnitHistory'
import Studios from './pages/Studios'
import Decks from './pages/Decks'
import Shoes from './pages/Shoes'
import DestroyedShoes from './pages/DestroyedShoes'
import Backups from './pages/Backups'
import Containers from './pages/Containers'
import Boxes from './pages/Boxes'
import { useAuth } from './contexts/AuthContext'

function AppWithProviders() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
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
              <Route path="/units" element={<Units />} />
              <Route path="/units/:unitId/history" element={<UnitHistory />} />
              <Route path="/users" element={<Users />} />
              <Route path="/import" element={<Import />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/studios" element={<Studios />} />
              <Route path="/decks" element={<Decks />} />
              <Route path="/shoes" element={<Shoes />} />
              <Route path="/shoes/destroyed" element={<DestroyedShoes />} />
              <Route path="/containers" element={<Containers />} />
              <Route path="/boxes" element={<Boxes />} />
              {isAdmin && <Route path="/backups" element={<Backups />} />}
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
