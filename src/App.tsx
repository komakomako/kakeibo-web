import React from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import CalendarPage from './pages/CalendarPage'
import Settings from './pages/Settings'

export default function App() {
  const nav = useNavigate()
  const loc = useLocation()
  const tab = loc.pathname === '/calendar' ? 'calendar' : loc.pathname === '/settings' ? 'settings' : 'home'

  return (
    <>
      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <nav className="bottom-nav">
        <button className={`nav-item ${tab === 'home' ? 'active' : ''}`} onClick={() => nav('/')}>
          <span className="nav-icon">📊</span>ホーム
        </button>
        <button className={`nav-item ${tab === 'calendar' ? 'active' : ''}`} onClick={() => nav('/calendar')}>
          <span className="nav-icon">📅</span>カレンダー
        </button>
        <button className={`nav-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => nav('/settings')}>
          <span className="nav-icon">⚙️</span>設定
        </button>
      </nav>
    </>
  )
}
