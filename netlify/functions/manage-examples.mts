// ============================================================
// GET/POST/DELETE /api/examples — Bibliothèque d'exemples
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const db  = getDb();
  const url = new URL(req.url);

  // ── GET : lister les exemples ──
  if (req.method === 'GET') {
    try {
      const examples = await db`
        SELECT id, email_subject, email_from, LEFT(email_body, 300) AS email_body_preview,
               LEFT(ideal_response, 300) AS ideal_response_preview,
               classification, notes, created_at
        FROM examples
        ORDER BY created_at DESC
      `;
      return jsonResponse({ examples });
    } catch (err) {
      return errorResponse('Erreur serveur', 500);
    }
  }

  // ── POST : ajouter un exemple ──
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      const { email_subject, email_from, email_body, ideal_response, classification, notes } = body;

      if (!email_body || !ideal_response) {
        return errorResponse('email_body et ideal_response sont requis', 400);
      }

      const [row] = await db`
        INSERT INTO examples (email_subject, email_from, email_body, ideal_response, classification, notes)
        VALUES (
          ${email_subject ?? ''},
          ${email_from ?? ''},
          ${email_body},
          ${ideal_response},
          ${classification ?? 'NORMAL'},
          ${notes ?? ''}
        )
        RETURNING id, created_at
      ` as any[];

      return jsonResponse({ success: true, id: row.id, created_at: row.created_at });
    } catch (err) {
      console.error('[manage-examples] POST Erreur:', err);
      return errorResponse('Erreur serveur', 500);
    }
  }

  // ── DELETE : supprimer un exemple ──
  if (req.method === 'DELETE') {
    try {
      const id = url.searchParams.get('id');
      if (!id) return errorResponse('Paramètre "id" requis', 400);

      await db`DELETE FROM examples WHERE id = ${id}`;
      return jsonResponse({ success: true });
    } catch (err) {
      return errorResponse('Erreur serveur', 500);
    }
  }

  return errorResponse('Méthode non autorisée', 405);
}

export const config: Config = {
  path: '/api/examples',
};
