// ============================================================
// Background Function — Régénération brouillon avec contexte
// Retourne 202 immédiatement, traitement jusqu'à 15 minutes
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb } from './_db.js';
import { redraftWithContext } from './_claude.js';

export default async function handler(req: Request) {
  const parts   = new URL(req.url).pathname.split('/').filter(Boolean);
  const emailId = parts[2]; // /api/redraft/:id
  if (!emailId) return new Response(null, { status: 202 });

  const { context } = await req.json().catch(() => ({})) as { context?: string };
  if (!context) return new Response(null, { status: 202 });

  const db = getDb();

  const [emailRows, guideRows, exampleRows] = await Promise.all([
    db`SELECT * FROM emails WHERE id = ${emailId}`,
    db`SELECT content FROM guide ORDER BY updated_at DESC LIMIT 1`.catch(() => []),
    db`SELECT email_body, ideal_response, classification FROM examples ORDER BY created_at DESC LIMIT 5`.catch(() => []),
  ]);

  const email = (emailRows as any[])[0];
  if (!email) return new Response(null, { status: 202 });

  const newDraft = await redraftWithContext({
    guide:     (guideRows[0] as any)?.content ?? '',
    examples:  exampleRows as any[],
    fromEmail: email.from_email,
    fromName:  email.from_name,
    subject:   email.subject,
    body:      (email.body_text ?? '').slice(0, 3000),
    context,
  });

  await db`UPDATE emails SET draft_response = ${newDraft} WHERE id = ${emailId}`;
  console.log(`[redraft-bg] ✓ Email ${emailId} brouillon régénéré`);
  return new Response(null, { status: 202 });
}

export const config: Config = { path: '/api/redraft/:id' };
