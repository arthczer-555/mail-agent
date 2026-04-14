// ============================================================
// POST /api/bulk-action
// Body: { action: 'mark-read', classification: 'FAIBLE' }
// ============================================================
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';
import { markAsRead } from './_gmail.js';

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

  // 1. D'abord marquer comme lus dans Gmail
  const gmailIds = (rows as any[]).map((r: any) => r.gmail_id).filter(Boolean);
  const results  = await Promise.allSettled(
    gmailIds.map((gmailId: string) => markAsRead(gmailId))
  );

  // 2. Identifier quels gmail_ids ont été marqués avec succès
  const succeededGmailIds = new Set(gmailIds.filter((_, i) => results[i].status === 'fulfilled' && (results[i] as PromiseFulfilledResult<boolean>).value === true));
  const idsToDelete = (rows as any[]).filter((r: any) => !r.gmail_id || succeededGmailIds.has(r.gmail_id)).map((r: any) => r.id);
  const idsToKeep   = (rows as any[]).filter((r: any) => r.gmail_id && !succeededGmailIds.has(r.gmail_id)).map((r: any) => r.id);

  // 3. Supprimer ceux confirmés par Gmail, garder les autres en rejected
  if (idsToDelete.length > 0) {
    await db`DELETE FROM emails WHERE id = ANY(${idsToDelete}::uuid[])`;
  }
  if (idsToKeep.length > 0) {
    await db`UPDATE emails SET status = 'rejected' WHERE id = ANY(${idsToKeep}::uuid[])`;
  }

  const ids = (rows as any[]).map((r: any) => r.id);

  return jsonResponse({ success: true, updated: ids.length });
}
