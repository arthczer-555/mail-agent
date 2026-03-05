// ============================================================
// GET/POST/DELETE /api/rules — Règles de classification
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const db  = getDb();
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const rules = await db`SELECT * FROM classification_rules ORDER BY classification, rule_type`;
    return jsonResponse({ rules });
  }

  if (req.method === 'POST') {
    const { rule_type, value, classification } = await req.json();
    if (!rule_type || !value || !classification) {
      return errorResponse('rule_type, value et classification requis', 400);
    }
    const [row] = await db`
      INSERT INTO classification_rules (rule_type, value, classification)
      VALUES (${rule_type}, ${value}, ${classification})
      RETURNING id
    ` as any[];
    return jsonResponse({ success: true, id: row.id });
  }

  if (req.method === 'DELETE') {
    const id = url.searchParams.get('id');
    if (!id) return errorResponse('"id" requis', 400);
    await db`DELETE FROM classification_rules WHERE id = ${id}`;
    return jsonResponse({ success: true });
  }

  return errorResponse('Méthode non autorisée', 405);
}

export const config: Config = {
  path: '/api/rules',
};
