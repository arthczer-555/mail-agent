// ============================================================
// GET /api/sync-read — Supprime de la DB les emails lus dans Gmail
// Endpoint léger appelé toutes les 2 min par le dashboard
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse } from './_db.js';
import { getGmailClient } from './_gmail.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const gmail = getGmailClient();
    const db = getDb();

    // Lister les emails non lus dans Gmail
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -from:me newer_than:3d',
      maxResults: 50,
    });
    const unreadIds = new Set(
      (listRes.data.messages ?? []).map(m => m.id).filter(Boolean) as string[]
    );

    // Récupérer les emails pending en DB
    const pendingRows = await db`
      SELECT id, gmail_id FROM emails
      WHERE status = 'pending'
        AND created_at > NOW() - INTERVAL '7 days'
    `;
    const toRemove = (pendingRows as any[]).filter(
      r => r.gmail_id && !unreadIds.has(r.gmail_id)
    );

    if (toRemove.length > 0) {
      const ids = toRemove.map((r: any) => r.id);
      await db`UPDATE emails SET status = 'rejected' WHERE id = ANY(${ids})`;
    }

    return jsonResponse({ success: true, removed: toRemove.length });
  } catch (err) {
    console.error('[sync-read] Erreur:', err);
    return jsonResponse({ success: false, removed: 0 });
  }
}

export const config: Config = {
  path: '/api/sync-read',
};
