/**
 * routes/AppRouter.jsx
 * The main URL switchboard. All page routes defined here.
 */
import { Routes, Route } from 'react-router-dom'
import MainLayout from '../components/layout/MainLayout'
import ProtectedRoute from './ProtectedRoute'
import Home from '../pages/Home'
import Marketplace from '../pages/Marketplace'
import ProductView from '../pages/ProductView'
import Dashboard from '../pages/Dashboard'
import AdminDashboard from '../pages/AdminDashboard'

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        {/* Public routes */}
        <Route path="/" element={<Home />} />
        <Route path="/marketplace" element={<Marketplace />} />
        <Route path="/asset/:slug" element={<ProductView />} />

        {/* Protected routes — requires login */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>
      </Route>
    </Routes>
  )
}
