import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider } from './contexts/AuthContext'
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
import Receive from './pages/movements/Receive'
import Transfer from './pages/movements/Transfer'
import Issue from './pages/movements/Issue'
import Return from './pages/movements/Return'
import Import from './pages/Import'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
              <Route path="/movements/receive" element={<Receive />} />
              <Route path="/movements/transfer" element={<Transfer />} />
              <Route path="/movements/issue" element={<Issue />} />
              <Route path="/movements/return" element={<Return />} />
              <Route path="/import" element={<Import />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
