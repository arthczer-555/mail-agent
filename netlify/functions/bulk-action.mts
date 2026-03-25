// ============================================================
// POST /api/bulk-action
// Body: { action: 'mark-read', classification: 'FAIBLE' }
// ============================================================
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';
import { getGmailClient } from './_gmail.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Méthode non autorisée', 405);
  }

  const body           = await req.json().catch(() => ({})) as any;
  const { action, classification } = body as { action: string; classification: string };

  if (action !== 'mark-read' || !classification) {
    return errorResponse('Paramètres invalides', 400);
  }

  const db = getDb();

  // Récupérer tous les emails FAIBLE en attente
  const rows = await db`
    SELECT id, gmail_id FROM emails
    WHERE classification = ${classification}
      AND status = 'pending'
  `;

  if ((rows as any[]).length === 0) {
    return jsonResponse({ success: true, updated: 0 });
  }

  // Supprimer de la base (pour permettre le re-polling si remis non lu dans Gmail)
  const ids = (rows as any[]).map((r: any) => r.id);
  await db`DELETE FROM emails WHERE id = ANY(${ids}::uuid[])`;

  // Marquer comme lus dans Gmail (silencieux si erreur)
  try {
    const gmail    = getGmailClient();
    const gmailIds = (rows as any[]).map((r: any) => r.gmail_id).filter(Boolean);
    await Promise.allSettled(
      gmailIds.map((gmailId: string) =>
        gmail.users.messages.modify({
          userId: 'me',
          id:     gmailId,
          requestBody: { removeLabelIds: ['UNREAD'] },
        })
      )
    );
  } catch {
    // silencieux
  }

  return jsonResponse({ success: true, updated: ids.length });
}
