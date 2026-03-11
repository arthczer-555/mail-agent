import { useState } from 'react'
import Dashboard from './components/Dashboard'
import AdminPanel from './components/AdminPanel'

type View = 'dashboard' | 'admin'

export default function App() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <div className="min-h-screen bg-[#F5F0EA]">
      {/* ── Header ── */}
      <header className="bg-[#F5F0EA] border-b border-[#E8E2D9] sticky top-0 z-40">
        <div className="px-6 h-[60px] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-base font-black text-[#E8452A] tracking-tight">COACHELLO</span>
            <span className="text-[#D8D0C5] select-none">|</span>
            <span className="text-xs text-[#aaa] font-semibold uppercase tracking-widest">Agent Email</span>
          </div>

          <nav className="flex items-center gap-1 bg-[#EDE8E0] rounded-full p-1">
            <button
              onClick={() => setView('dashboard')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                view === 'dashboard'
                  ? 'bg-white text-[#1a1a1a] shadow-sm'
                  : 'text-[#999] hover:text-[#555]'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setView('admin')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                view === 'admin'
                  ? 'bg-white text-[#1a1a1a] shadow-sm'
                  : 'text-[#999] hover:text-[#555]'
              }`}
            >
              Administration
            </button>
          </nav>
        </div>
      </header>

      {/* ── Contenu ── */}
      <main className={view === 'dashboard'
        ? 'px-6 py-5'
        : 'max-w-5xl mx-auto px-6 py-6'
      }>
        {view === 'dashboard' ? <Dashboard /> : <AdminPanel />}
      </main>
    </div>
  )
}
