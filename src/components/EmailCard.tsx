import { Email, CLASSIFICATION_CONFIG } from '../types'

interface Props {
  email: Email
  onOpen: (email: Email) => void
}

function timeAgo(dateStr: string): string {
  const diff  = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 1)   return 'à l\'instant'
  if (mins < 60)  return `il y a ${mins} min`
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${days}j`
}

export default function EmailCard({ email, onOpen }: Props) {
  const conf = CLASSIFICATION_CONFIG[email.classification]

  return (
    <button
      onClick={() => onOpen(email)}
      className="w-full text-left p-3.5 rounded-2xl border border-gray-100 bg-white transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer shadow-sm"
    >
      {/* En-tête carte */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-800 truncate">
            {email.from_name || email.from_email}
          </p>
          <p className="text-xs text-gray-400 truncate">{email.from_email}</p>
        </div>
        <span className="text-xs text-gray-300 flex-shrink-0">{timeAgo(email.received_at)}</span>
      </div>

      {/* Objet */}
      <p className="text-sm font-medium text-gray-900 truncate mb-2">
        {email.subject}
      </p>

      {/* Aperçu du brouillon */}
      {email.draft_preview && (
        <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
          {email.draft_preview}
        </p>
      )}

      {/* Indicateur de classification */}
      <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${conf.badge}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${
          email.classification === 'URGENT'    ? 'bg-red-500' :
          email.classification === 'IMPORTANT' ? 'bg-orange-400' :
          email.classification === 'NORMAL'    ? 'bg-blue-400' :
          'bg-gray-400'
        }`} />
        {conf.label}
      </div>
    </button>
  )
}
