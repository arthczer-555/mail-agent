import { useState } from 'react'
import Dashboard from './components/Dashboard'
import AdminPanel from './components/AdminPanel'

type View = 'dashboard' | 'admin'

export default function App() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40">
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-bold text-black tracking-tight">Coachello</span>
            <span className="text-gray-200">|</span>
            <span className="text-xs text-gray-400 font-medium uppercase tracking-widest">Agent Email</span>
          </div>

          <nav className="flex items-center gap-1 bg-gray-100 rounded-full p-1">
            <button
              onClick={() => setView('dashboard')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                view === 'dashboard'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView('admin')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                view === 'admin'
                  ? 'bg-white text-black shadow-sm'
                  : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Administration
            </button>
          </nav>
        </div>
      </header>

      {/* ── Contenu ── */}
      <main className={view === 'dashboard'
        ? 'px-4 sm:px-6 py-4'
        : 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6'
      }>
        {view === 'dashboard' ? <Dashboard /> : <AdminPanel />}
      </main>
    </div>
  )
}
