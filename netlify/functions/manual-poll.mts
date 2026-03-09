// ============================================================
// Polling manuel — déclenché via bouton depuis le dashboard
// Traite 1 email à la fois (anti-timeout 26s Netlify)
// ============================================================
import { getDb, corsHeaders, jsonResponse } from './_db.js';
import { getGmailClient, extractBody, extractAttachments, getHeader, buildRawEmail } from './_gmail.js';
import { classifyAndDraftEmail } from './_claude.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const gmail = getGmailClient();
  const db    = getDb();

  console.log('[manual-poll] Démarrage —', new Date().toISOString());

  try {
    // ── 0. Sync : retirer du dashboard les emails lus externalement dans Gmail ──
    console.log('[manual-poll] Étape 0 : sync DB...');
    try {
      const pendingRows = await db`SELECT id, gmail_id FROM emails WHERE status IN ('pending', 'locked')`;
      const pending = (pendingRows as any[]);
      console.log('[manual-poll] Étape 0 : DB OK, pending=', pending.length);
      if (pending.length > 0) {
        console.log('[manual-poll] Étape 0 : appel Gmail sync...');
        const unreadRes = await gmail.users.messages.list({
          userId: 'me',
          q: 'is:unread -from:me newer_than:7d',
          maxResults: 100,
        });
        console.log('[manual-poll] Étape 0 : Gmail sync OK');
        const unreadIds = new Set((unreadRes.data.messages ?? []).map((m: any) => m.id));
        const toSync = pending.filter(p => !unreadIds.has(p.gmail_id));
        if (toSync.length > 0) {
          const ids = toSync.map(p => p.id);
          await db`UPDATE emails SET status = 'dismissed' WHERE id = ANY(${ids})`;
        }
      }
    } catch (e) { console.log('[manual-poll] Étape 0 erreur (ignoré):', String(e)); }

    // ── 1. Charger le guide, les exemples et les règles ──
    console.log('[manual-poll] Étape 1 : chargement guide/exemples/règles...');
    const [guideRows, exampleRows, ruleRows] = await Promise.all([
      db`SELECT content FROM guide ORDER BY updated_at DESC LIMIT 1`,
      db`SELECT email_body, ideal_response, classification FROM examples ORDER BY created_at DESC LIMIT 20`,
      db`SELECT rule_type, value, classification FROM classification_rules`,
    ]);
    console.log('[manual-poll] Étape 1 : OK');

    const guide    = (guideRows[0] as any)?.content ?? '';
    const examples = exampleRows as any[];
    const rules    = ruleRows    as any[];

    // ── 2. Récupérer les IDs déjà traités ──
    console.log('[manual-poll] Étape 2 : IDs déjà traités...');
    const processedRows = await db`SELECT gmail_id FROM emails WHERE created_at > NOW() - INTERVAL '7 days'`;
    const processedIds  = new Set((processedRows as any[]).map((r: any) => r.gmail_id));
    console.log('[manual-poll] Étape 2 : OK,', processedRows.length, 'emails en DB');

    // ── 3. Lister les emails non lus ──
    console.log('[manual-poll] Étape 3 : liste Gmail non lus...');
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'is:unread -from:me newer_than:3d',
      maxResults: 10,
    });
    console.log('[manual-poll] Étape 3 : OK,', listRes.data.messages?.length ?? 0, 'emails trouvés');

    const messages = listRes.data.messages ?? [];
    let processed = 0;
    let skipped   = 0;

    // ── 4. Traiter 1 email (anti-timeout) ──
    for (const { id: gmailId, threadId } of messages) {
      if (!gmailId) continue;
      if (processedIds.has(gmailId)) { skipped++; continue; }

      try {
        const msgRes = await gmail.users.messages.get({ userId: 'me', id: gmailId, format: 'full' });
        const payload = msgRes.data.payload;
        if (!payload) continue;

        const headers    = payload.headers ?? [];
        const fromRaw    = getHeader(headers, 'From');
        const toRaw      = getHeader(headers, 'To');
        const subject    = getHeader(headers, 'Subject') || '(sans objet)';
        const dateStr    = getHeader(headers, 'Date');
        const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

        const fromMatch = fromRaw.match(/^(.*?)\s*<(.+?)>$/) ?? [null, fromRaw, fromRaw];
        const fromName  = (fromMatch[1] ?? '').replace(/"/g, '').trim();
        const fromEmail = (fromMatch[2] ?? fromRaw).trim();

        const { text: bodyText, html: bodyHtml } = extractBody(payload);
        const attachments = extractAttachments(payload);

        let effectiveBody = bodyText.trim();
        if (effectiveBody.length < 10 && bodyHtml) {
          effectiveBody = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        }
        if (effectiveBody.length < 5 && subject === '(sans objet)') { skipped++; continue; }

        const result = await classifyAndDraftEmail({
          guide, examples, rules, fromEmail, fromName, subject,
          body: effectiveBody.slice(0, 3000),
        });

        try {
          await db`
            INSERT INTO emails (
              gmail_id, thread_id, from_email, from_name, to_email,
              subject, body_text, body_html, received_at,
              classification, reasoning, draft_response, status, attachments
            ) VALUES (
              ${gmailId}, ${threadId ?? ''}, ${fromEmail}, ${fromName}, ${toRaw},
              ${subject}, ${bodyText}, ${bodyHtml}, ${receivedAt},
              ${result.classification}, ${result.reasoning}, ${result.draft_response}, 'pending',
              ${JSON.stringify(attachments)}::jsonb
            )
            ON CONFLICT (gmail_id) DO NOTHING
          `;
        } catch {
          await db`
            INSERT INTO emails (
              gmail_id, thread_id, from_email, from_name, to_email,
              subject, body_text, body_html, received_at,
              classification, reasoning, draft_response, status
            ) VALUES (
              ${gmailId}, ${threadId ?? ''}, ${fromEmail}, ${fromName}, ${toRaw},
              ${subject}, ${bodyText}, ${bodyHtml}, ${receivedAt},
              ${result.classification}, ${result.reasoning}, ${result.draft_response}, 'pending'
            )
            ON CONFLICT (gmail_id) DO NOTHING
          `;
        }

        if (result.classification === 'URGENT') {
          try {
            const senderEmail  = process.env.GMAIL_ADDRESS ?? 'contact@coachello.io';
            const alertAddress = process.env.URGENT_ALERT_EMAIL ?? 'gaspard@coachello.io';
            const alertRaw = buildRawEmail({
              to: alertAddress, from: senderEmail,
              subject: '🚨 MAIL URGENT SUR LA BOITE COACH',
              body: `Un email urgent vient d'arriver sur la boîte Coachello.\n\nDe : ${fromName ? `${fromName} ` : ''}${fromEmail}\nObjet : ${subject}\n\nAnalyse : ${result.reasoning}\n\n→ Traiter sur https://coachello-mail-agent.netlify.app`,
            });
            await gmail.users.messages.send({ userId: 'me', requestBody: { raw: alertRaw } });
          } catch {/* silencieux */}
        }

        processed++;
        console.log(`[manual-poll] ✓ ${fromEmail} — ${subject} → ${result.classification}`);
        break; // 1 email par appel (anti-timeout 26s)

      } catch (err) {
        console.error(`[manual-poll] ✗ Erreur:`, err);
      }
    }

    return jsonResponse({ success: true, processed, skipped, total: messages.length });

  } catch (err) {
    console.error('[manual-poll] Erreur fatale:', err);
    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
}

