import { useState } from 'react'
import { Email, CLASSIFICATION_CONFIG } from '../types'

interface Props {
  email: Email
  onClose: () => void
  onAction: () => void
}

export default function EmailDetail({ email, onClose, onAction }: Props) {
  const [response, setResponse]   = useState(email.draft_response)
  const [loading, setLoading]     = useState(false)
  const [mode, setMode]           = useState<'view' | 'edit'>('view')
  const [feedback, setFeedback]   = useState<string | null>(null)

  const conf = CLASSIFICATION_CONFIG[email.classification]

  const sendAction = async (action: 'validate' | 'reject') => {
    setLoading(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/emails/${email.id}/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: 'team', final_response: response }),
      })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Erreur')

      if (action === 'validate') {
        const actionLabel = data.action === 'sent' ? 'Réponse envoyée ✓' : 'Brouillon enregistré dans Gmail ✓'
        setFeedback(actionLabel)
        setTimeout(onAction, 1200)
      } else {
        setFeedback('Email rejeté')
        setTimeout(onAction, 800)
      }
    } catch (err: any) {
      setFeedback(`Erreur : ${err.message}`)
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

  return (
    <div className="card h-full flex flex-col overflow-hidden">
      {/* ── Barre du haut ── */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${conf.border} ${conf.bg}`}>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${conf.badge}`}>
            {conf.label}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900 line-clamp-1">{email.subject}</p>
            <p className="text-xs text-gray-500">
              {email.from_name && `${email.from_name} · `}{email.from_email} · {formatDate(email.received_at)}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/60 rounded-lg transition-colors text-gray-400 hover:text-gray-700"
          title="Fermer"
        >
          ✕
        </button>
      </div>

      {/* ── Corps : email + brouillon côte à côte ── */}
      <div className="flex-1 overflow-hidden grid grid-cols-2 divide-x divide-gray-100">

        {/* Colonne gauche : email original */}
        <div className="overflow-y-auto p-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Email reçu
          </h3>
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
            {email.body_text || '(corps vide)'}
          </div>

          {/* Raisonnement Claude */}
          {email.reasoning && (
            <div className="mt-4 p-3 bg-indigo-50 rounded-lg border border-indigo-100">
              <p className="text-xs font-semibold text-indigo-700 mb-1">Analyse de l'agent</p>
              <p className="text-xs text-indigo-600 leading-relaxed">{email.reasoning}</p>
            </div>
          )}
        </div>

        {/* Colonne droite : brouillon de réponse */}
        <div className="overflow-y-auto p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Brouillon de réponse
            </h3>
            <button
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2"
            >
              {mode === 'view' ? '✏️ Modifier' : '👁 Prévisualiser'}
            </button>
          </div>

          {mode === 'view' ? (
            <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed flex-1">
              {response}
            </div>
          ) : (
            <textarea
              value={response}
              onChange={e => setResponse(e.target.value)}
              className="flex-1 text-sm text-gray-700 leading-relaxed border border-gray-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Réponse..."
            />
          )}
        </div>
      </div>

      {/* ── Barre d'actions ── */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-3">
        {/* Info sur l'envoi */}
        <p className="text-xs text-gray-400">
          {['NORMAL', 'FAIBLE'].includes(email.classification)
            ? '→ Envoi direct depuis Gmail'
            : '→ Sauvegarde en brouillon Gmail (validation finale à faire)'
          }
        </p>

        <div className="flex items-center gap-2">
          {feedback ? (
            <span className="text-sm font-medium text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
              {feedback}
            </span>
          ) : (
            <>
              <button
                onClick={() => sendAction('reject')}
                disabled={loading}
                className="btn-danger text-sm"
              >
                Rejeter
              </button>
              <button
                onClick={() => sendAction('validate')}
                disabled={loading || !response.trim()}
                className="btn-success text-sm"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Envoi...
                  </span>
                ) : (
                  ['NORMAL', 'FAIBLE'].includes(email.classification)
                    ? '✓ Valider et envoyer'
                    : '✓ Valider (brouillon)'
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
