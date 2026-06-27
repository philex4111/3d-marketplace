/**
 * components/layout/MainLayout.jsx
 * The static shell — Navbar at top, Footer at bottom, page content in between.
 * Outlet renders the current route's page component.
 */
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'

export default function MainLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
