// ============================================================
// GET /api/usage — Statistiques de coût Claude (bot)
// ============================================================
import type { Config } from '@netlify/functions';
import { getDb, corsHeaders, jsonResponse } from './_db.js';

export default async function handler(req: Request) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Méthode non autorisée' }, 405);
  }

  // Mode debug : prouve que la fonction se charge et tourne
  if (new URL(req.url).searchParams.get('debug') === '1') {
    return jsonResponse({ ok: true, hasDbUrl: !!process.env.DATABASE_URL });
  }

  try {
    const db = getDb();

    // S'assurer que la table existe (idempotent)
    try {
      await db`
        CREATE TABLE IF NOT EXISTS claude_usage (
          id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          function_name         VARCHAR(100) NOT NULL,
          model                 VARCHAR(100) NOT NULL,
          input_tokens          INTEGER NOT NULL DEFAULT 0,
          output_tokens         INTEGER NOT NULL DEFAULT 0,
          cache_read_tokens     INTEGER NOT NULL DEFAULT 0,
          cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
          cost_usd              NUMERIC(10, 6) NOT NULL DEFAULT 0,
          email_id              UUID,
          email_subject         TEXT,
          created_at            TIMESTAMP DEFAULT NOW()
        )
      `;
    } catch (e) {
      console.error('[usage] CREATE TABLE failed:', e);
    }

    const totals = await db`
      SELECT
        COUNT(*)::int                                                      AS total_calls,
        COALESCE(SUM(cost_usd), 0)::float                                  AS total_cost,
        COALESCE(SUM(input_tokens), 0)::int                                AS total_input,
        COALESCE(SUM(output_tokens), 0)::int                               AS total_output,
        COALESCE(SUM(cost_usd) FILTER (WHERE function_name = 'classifyAndDraftEmail'), 0)::float AS classify_cost,
        COUNT(*) FILTER (WHERE function_name = 'classifyAndDraftEmail')::int AS classify_calls
      FROM claude_usage
    `;
    const totalsRow = (totals as any[])[0] ?? {};

    const byFunction = await db`
      SELECT function_name, model,
             COUNT(*)::int                AS calls,
             COALESCE(SUM(cost_usd),0)::float AS cost,
             COALESCE(SUM(input_tokens),0)::int  AS input_tokens,
             COALESCE(SUM(output_tokens),0)::int AS output_tokens
      FROM claude_usage
      GROUP BY function_name, model
      ORDER BY cost DESC
    `;

    const log = await db`
      SELECT id, function_name, model,
             input_tokens, output_tokens,
             cache_read_tokens, cache_creation_tokens,
             cost_usd::float AS cost_usd,
             email_subject, created_at
      FROM claude_usage
      ORDER BY created_at DESC
      LIMIT 500
    `;

    const totalCalls    = totalsRow.total_calls    ?? 0;
    const totalCost     = totalsRow.total_cost     ?? 0;
    const classifyCalls = totalsRow.classify_calls ?? 0;
    const classifyCost  = totalsRow.classify_cost  ?? 0;

    const avgPerEmail = classifyCalls > 0 ? totalCost / classifyCalls : 0;

    return jsonResponse({
      summary: {
        total_calls:    totalCalls,
        total_cost:     totalCost,
        total_input:    totalsRow.total_input  ?? 0,
        total_output:   totalsRow.total_output ?? 0,
        emails_processed: classifyCalls,
        avg_cost_per_email: avgPerEmail,
        classify_cost:  classifyCost,
      },
      by_function: byFunction,
      log,
    });
  } catch (err: any) {
    console.error('[usage] Erreur:', err);
    return jsonResponse(
      { error: `Erreur serveur : ${err?.message ?? String(err)}` },
      500
    );
  }
}

export const config: Config = {
  path: '/api/usage',
};
