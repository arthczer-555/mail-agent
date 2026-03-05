// ============================================================
// POST /api/guide — Uploader le guide de réponse (DOCX ou TXT)
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';
import mammoth from 'mammoth';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET : récupérer le guide actuel
  if (req.method === 'GET') {
    try {
      const db   = getDb();
      const rows = await db`SELECT content, filename, updated_at FROM guide ORDER BY updated_at DESC LIMIT 1`;
      return jsonResponse({ guide: (rows as any[])[0] ?? null });
    } catch (err) {
      return errorResponse('Erreur serveur', 500);
    }
  }

  // POST : uploader un nouveau guide
  if (req.method !== 'POST') {
    return errorResponse('Méthode non autorisée', 405);
  }

  try {
    const db          = getDb();
    const contentType = req.headers.get('content-type') ?? '';

    let content  = '';
    let filename = 'guide';

    // ── Fichier DOCX via multipart/form-data ──
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file     = formData.get('file') as File | null;

      if (!file) return errorResponse('Aucun fichier reçu', 400);

      filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      if (file.name.endsWith('.docx')) {
        // Convertir DOCX → texte brut avec mammoth
        const result = await mammoth.extractRawText({ buffer });
        content = result.value;
      } else if (file.name.endsWith('.txt') || file.name.endsWith('.md')) {
        content = buffer.toString('utf-8');
      } else {
        return errorResponse('Format non supporté — utilisez .docx, .txt ou .md', 400);
      }

    // ── Texte brut via JSON ──
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      content  = body.content;
      filename = body.filename ?? 'guide.txt';
      if (!content) return errorResponse('Champ "content" manquant', 400);

    } else {
      return errorResponse('Content-Type non supporté', 415);
    }

    if (content.trim().length < 10) {
      return errorResponse('Le guide est trop court ou vide', 400);
    }

    // Remplacer le guide existant (une seule ligne en BDD)
    await db`DELETE FROM guide`;
    await db`
      INSERT INTO guide (content, filename, updated_at)
      VALUES (${content}, ${filename}, NOW())
    `;

    return jsonResponse({
      success:   true,
      filename,
      length:    content.length,
      preview:   content.slice(0, 200),
    });

  } catch (err) {
    console.error('[upload-guide] Erreur:', err);
    return errorResponse('Erreur serveur', 500);
  }
}

export const config: Config = {
  path: '/api/guide',
};
