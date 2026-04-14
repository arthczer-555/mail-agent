// ============================================================
// POST /api/emails/:id/:action
// Actions : lock | unlock | validate | reject
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse, errorResponse } from './_db.js';
import { getGmailClient, buildRawEmail, type OutgoingAttachment } from './_gmail.js';
import { askClarifyingQuestions } from './_claude.js';

// Extraire l'adresse email d'une entrée "Nom <email>" ou "email"
function extractEmail(addr: string): string {
  const match = addr.match(/<([^>]+)>/);
  return (match ? match[1] : addr).toLowerCase().trim();
}

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('Méthode non autorisée', 405);
  }

  const url    = new URL(req.url);
  const parts  = url.pathname.split('/').filter(Boolean);
  // /api/emails/:id/:action  →  ['api', 'emails', ':id', ':action']
  const emailId = parts[2];
  const action  = parts[3]; // lock | unlock | validate | reject

  if (!emailId || !action) {
    return errorResponse('URL invalide — attendu : /api/emails/:id/:action', 400);
  }

  const db = getDb();

  try {
    // ── Récupérer l'email ──
    const rows = await db`SELECT * FROM emails WHERE id = ${emailId}`;
    if ((rows as any[]).length === 0) return errorResponse('Email introuvable', 404);
    const email = (rows as any[])[0];

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { user = 'team', final_response, attachments: reqAttachments } = body as {
      user?: string; final_response?: string; attachments?: OutgoingAttachment[];
    };

    // ──────────────────────────────────────────────────
    // ACTION : lock (un membre de l'équipe ouvre l'email)
    // ──────────────────────────────────────────────────
    if (action === 'lock') {
      if (email.status === 'locked' && email.locked_by !== user) {
        return jsonResponse({ locked: true, locked_by: email.locked_by }, 409);
      }
      await db`
        UPDATE emails
        SET status = 'locked', locked_by = ${user}, locked_at = NOW()
        WHERE id = ${emailId}
      `;
      return jsonResponse({ success: true, action: 'locked' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : unlock
    // ──────────────────────────────────────────────────
    if (action === 'unlock') {
      await db`
        UPDATE emails
        SET status = 'pending', locked_by = NULL, locked_at = NULL
        WHERE id = ${emailId}
      `;
      return jsonResponse({ success: true, action: 'unlocked' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : reject
    // ──────────────────────────────────────────────────
    if (action === 'reject') {
      // 1. D'abord marquer comme lu dans Gmail
      let gmailOk = false;
      if (email.gmail_id) {
        try {
          const gmail = getGmailClient();
          await gmail.users.messages.modify({
            userId: 'me',
            id: email.gmail_id,
            requestBody: { removeLabelIds: ['UNREAD'] },
          });
          gmailOk = true;
        } catch (err) {
          console.error(`[email-action] Échec marquage Gmail pour ${email.gmail_id}:`, err);
        }
      } else {
        gmailOk = true; // Pas de gmail_id → rien à marquer
      }

      // 2. Si Gmail OK → supprimer de la DB. Sinon garder pour retry.
      if (gmailOk) {
        await db`DELETE FROM emails WHERE id = ${emailId}`;
      } else {
        await db`UPDATE emails SET status = 'rejected', validated_by = ${user}, validated_at = NOW() WHERE id = ${emailId}`;
      }
      return jsonResponse({ success: true, action: 'rejected' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : report (marquer comme spam dans Gmail)
    // ──────────────────────────────────────────────────
    if (action === 'report') {
      let gmailOk = false;
      if (email.gmail_id) {
        try {
          const gmail = getGmailClient();
          await gmail.users.messages.modify({
            userId: 'me',
            id: email.gmail_id,
            requestBody: {
              addLabelIds: ['SPAM'],
              removeLabelIds: ['INBOX', 'UNREAD'],
            },
          });
          gmailOk = true;
        } catch (err) {
          console.error(`[email-action] Échec report Gmail pour ${email.gmail_id}:`, err);
        }
      } else {
        gmailOk = true;
      }

      if (gmailOk) {
        await db`DELETE FROM emails WHERE id = ${emailId}`;
      } else {
        await db`UPDATE emails SET status = 'rejected', validated_by = ${user}, validated_at = NOW() WHERE id = ${emailId}`;
      }
      return jsonResponse({ success: true, action: 'reported' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : validate (envoyer ou créer brouillon Gmail)
    // ──────────────────────────────────────────────────
    if (action === 'validate') {
      const responseText = final_response ?? email.draft_response;
      if (!responseText) return errorResponse('Aucun texte de réponse fourni', 400);

      const gmail       = getGmailClient();
      const senderEmail = (process.env.GMAIL_ADDRESS ?? 'contact@coachello.io').toLowerCase();

      // Récupérer le Message-ID de l'email original depuis Gmail (pour In-Reply-To)
      let inReplyTo: string | undefined = email.message_id || undefined;
      if (!inReplyTo && email.gmail_id) {
        try {
          const orig = await gmail.users.messages.get({
            userId: 'me', id: email.gmail_id, format: 'metadata',
            metadataHeaders: ['Message-ID'],
          });
          inReplyTo = orig.data.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'message-id')?.value || undefined;
        } catch { /* silencieux */ }
      }

      // Reply All : CC = destinataires originaux (To + Cc) sauf notre propre adresse
      const originalTo = (email.to_email ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => s && extractEmail(s) !== senderEmail);
      const originalCc = (email.cc_emails ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => s && extractEmail(s) !== senderEmail);
      const ccList     = [...originalTo, ...originalCc].join(', ') || undefined;

      const raw = buildRawEmail({
        to:         email.from_email,
        from:       senderEmail,
        subject:    email.subject,
        body:       responseText,
        cc:         ccList,
        threadId:   email.thread_id,
        inReplyTo,
        attachments: reqAttachments,
      });

      // Envoi direct pour toutes les classifications
      const sendRes = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId: email.thread_id },
      });

      // Marquer le message envoyé comme lu
      if (sendRes.data.id) {
        await gmail.users.messages.modify({
          userId: 'me',
          id: sendRes.data.id,
          requestBody: { removeLabelIds: ['UNREAD', 'INBOX'] },
        }).catch(() => {});
      }

      // Marquer l'email original comme lu dans Gmail AVANT de toucher la DB
      let gmailOk = false;
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: email.gmail_id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
        gmailOk = true;
      } catch (err) {
        console.error(`[email-action] Échec marquage Gmail pour ${email.gmail_id}:`, err);
      }

      // Si Gmail OK → supprimer de la DB. Sinon garder avec status='sent' pour ne pas réingérer.
      if (gmailOk) {
        await db`DELETE FROM emails WHERE id = ${emailId}`;
      } else {
        await db`
          UPDATE emails
          SET status = 'sent', validated_by = ${user}, validated_at = NOW(),
              final_response = ${responseText}
          WHERE id = ${emailId}
        `;
      }

      return jsonResponse({ success: true, action: 'sent' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : draft (brouillon Gmail pour tout type d'email)
    // ──────────────────────────────────────────────────
    if (action === 'draft') {
      const responseText = final_response ?? email.draft_response;
      if (!responseText) return errorResponse('Aucun texte de réponse fourni', 400);

      const gmail       = getGmailClient();
      const senderEmail = (process.env.GMAIL_ADDRESS ?? 'contact@coachello.io').toLowerCase();

      let inReplyTo: string | undefined = email.message_id || undefined;
      if (!inReplyTo && email.gmail_id) {
        try {
          const orig = await gmail.users.messages.get({
            userId: 'me', id: email.gmail_id, format: 'metadata',
            metadataHeaders: ['Message-ID'],
          });
          inReplyTo = orig.data.payload?.headers?.find((h: any) => h.name?.toLowerCase() === 'message-id')?.value || undefined;
        } catch { /* silencieux */ }
      }

      const originalTo = (email.to_email ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => s && extractEmail(s) !== senderEmail);
      const originalCc = (email.cc_emails ?? '').split(',').map((s: string) => s.trim()).filter((s: string) => s && extractEmail(s) !== senderEmail);
      const ccList     = [...originalTo, ...originalCc].join(', ') || undefined;

      const raw = buildRawEmail({
        to:        email.from_email,
        from:      senderEmail,
        subject:   email.subject,
        body:      responseText,
        cc:        ccList,
        threadId:  email.thread_id,
        inReplyTo,
        attachments: reqAttachments,
      });

      await gmail.users.drafts.create({
        userId: 'me',
        requestBody: {
          message: { raw, threadId: email.thread_id },
        },
      });

      // Marquer comme lu dans Gmail d'abord
      let gmailOk = false;
      try {
        await gmail.users.messages.modify({
          userId: 'me',
          id: email.gmail_id,
          requestBody: { removeLabelIds: ['UNREAD'] },
        });
        gmailOk = true;
      } catch (err) {
        console.error(`[email-action] Échec marquage Gmail pour ${email.gmail_id}:`, err);
      }

      if (gmailOk) {
        await db`DELETE FROM emails WHERE id = ${emailId}`;
      } else {
        await db`
          UPDATE emails
          SET status = 'draft_saved', validated_by = ${user}, validated_at = NOW(),
              final_response = ${responseText}
          WHERE id = ${emailId}
        `;
      }
      return jsonResponse({ success: true, action: 'draft_saved' });
    }

    // ──────────────────────────────────────────────────
    // ACTION : ask (générer des questions de clarification)
    // ──────────────────────────────────────────────────
    if (action === 'ask') {
      const guideRows = await db`SELECT content FROM guide ORDER BY updated_at DESC LIMIT 1`.catch(() => []);
      const guide = (guideRows[0] as any)?.content ?? '';
      const questions = await askClarifyingQuestions({
        guide,
        fromEmail: email.from_email,
        fromName:  email.from_name,
        subject:   email.subject,
        body:      (email.body_text ?? '').slice(0, 3000),
      });
      return jsonResponse({ success: true, questions });
    }

    return errorResponse(`Action inconnue : ${action}`, 400);

  } catch (err) {
    console.error(`[email-action] Erreur (${action} on ${emailId}):`, err);
    return errorResponse('Erreur serveur', 500);
  }
}

export const config: Config = {
  path: '/api/emails/:id/:action',
};
