import { useState, useEffect, useCallback } from 'react'
import { Email, Classification, Stats, CLASSIFICATION_CONFIG } from '../types'
import EmailCard from './EmailCard'
import EmailDetail from './EmailDetail'

const COLUMNS: Classification[] = ['URGENT', 'IMPORTANT', 'NORMAL', 'FAIBLE']

export default function Dashboard() {
  const [emails, setEmails]           = useState<Email[]>([])
  const [stats, setStats]             = useState<Stats[]>([])
  const [selectedEmail, setSelected]  = useState<Email | null>(null)
  const [loading, setLoading]         = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())

  const fetchEmails = useCallback(async () => {
    try {
      const res  = await fetch('/api/emails')
      const data = await res.json()
      setEmails(data.emails  ?? [])
      setStats(data.stats    ?? [])
      setLastRefresh(new Date())
    } catch (err) {
      console.error('Erreur fetchEmails:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  // Chargement initial + refresh automatique toutes les 2 minutes
  useEffect(() => {
    fetchEmails()
    const interval = setInterval(fetchEmails, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchEmails])

  // Ouvrir un email : verrouiller pour l'équipe
  const handleOpen = async (email: Email) => {
    // Tenter de lock
    const res  = await fetch(`/api/emails/${email.id}/lock`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: 'team' }),
    })
    const data = await res.json()

    if (res.status === 409) {
      alert(`Cet email est en cours de traitement par ${data.locked_by}`)
      return
    }

    // Récupérer l'email complet
    const fullRes  = await fetch(`/api/emails?status=locked`)
    const fullData = await fullRes.json()
    const fullEmail = (fullData.emails as Email[]).find(e => e.id === email.id) ?? email

    setSelected(fullEmail)
    setEmails(prev => prev.map(e => e.id === email.id ? { ...e, status: 'locked' } : e))
  }

  // Fermer le panneau détail : déverrouiller
  const handleClose = async () => {
    if (!selectedEmail) return
    await fetch(`/api/emails/${selectedEmail.id}/unlock`, { method: 'POST' })
    setSelected(null)
    fetchEmails()
  }

  // Après une action (valider/rejeter), rafraîchir
  const handleAction = () => {
    setSelected(null)
    fetchEmails()
  }

  // Compter les emails par colonne
  const countForColumn = (classification: Classification) =>
    emails.filter(e => e.classification === classification).length

  // Stats totales par classification (toutes statuses confondus)
  const totalForColumn = (classification: Classification) => {
    const relevant = stats.filter(s => s.classification === classification)
    return relevant.reduce((sum, s) => sum + parseInt(s.count), 0)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">

      {/* ── Colonnes du Kanban ── */}
      <div className={`flex gap-4 flex-1 ${selectedEmail ? 'hidden lg:flex' : 'flex'}`}>
        {COLUMNS.map(classification => {
          const conf          = CLASSIFICATION_CONFIG[classification]
          const columnEmails  = emails.filter(e => e.classification === classification)

          return (
            <div key={classification} className="flex-1 flex flex-col min-w-0">
              {/* En-tête de colonne */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-3 ${conf.bg} ${conf.border} border`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    classification === 'URGENT'    ? 'bg-red-500' :
                    classification === 'IMPORTANT' ? 'bg-orange-500' :
                    classification === 'NORMAL'    ? 'bg-yellow-500' :
                    'bg-green-500'
                  }`} />
                  <span className={`font-semibold text-sm ${conf.color}`}>{conf.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${conf.badge}`}>
                    {countForColumn(classification)}
                  </span>
                  <span className="text-xs text-gray-400">/ {totalForColumn(classification)}</span>
                </div>
              </div>

              {/* Cartes emails */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {columnEmails.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    Aucun email en attente
                  </div>
                ) : (
                  columnEmails.map(email => (
                    <EmailCard
                      key={email.id}
                      email={email}
                      onOpen={handleOpen}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Panneau détail ── */}
      {selectedEmail && (
        <div className="w-full lg:w-[55%] flex-shrink-0">
          <EmailDetail
            email={selectedEmail}
            onClose={handleClose}
            onAction={handleAction}
          />
        </div>
      )}

      {/* ── Barre du bas : refresh info ── */}
      {!selectedEmail && (
        <div className="fixed bottom-4 right-6 text-xs text-gray-400 flex items-center gap-2">
          <button
            onClick={fetchEmails}
            className="hover:text-indigo-600 transition-colors underline underline-offset-2"
          >
            Actualiser
          </button>
          <span>— mis à jour à {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      )}
    </div>
  )
}
