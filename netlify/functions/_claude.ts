// ============================================================
// Helper partagé : appel à l'API Claude (Anthropic)
// ============================================================
import Anthropic from '@anthropic-ai/sdk';

export interface ClaudeEmailResult {
  classification: 'URGENT' | 'IMPORTANT' | 'NORMAL' | 'FAIBLE';
  reasoning: string;
  draft_response: string;
}

export async function classifyAndDraftEmail(opts: {
  guide: string;
  examples: Array<{ email_body: string; ideal_response: string; classification: string }>;
  rules: Array<{ rule_type: string; value: string; classification: string }>;
  fromEmail: string;
  fromName: string;
  subject: string;
  body: string;
}): Promise<ClaudeEmailResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Construire la section règles de classification
  const rulesText = opts.rules.length > 0
    ? opts.rules.map(r => `- Si ${r.rule_type} contient "${r.value}" → ${r.classification}`).join('\n')
    : 'Aucune règle spécifique définie.';

  // Construire la section exemples
  const examplesText = opts.examples.length > 0
    ? opts.examples.slice(0, 8).map((ex, i) =>
        `### Exemple ${i + 1} (${ex.classification})\n**Email reçu:**\n${ex.email_body}\n\n**Réponse idéale:**\n${ex.ideal_response}`
      ).join('\n\n---\n\n')
    : 'Aucun exemple disponible pour l\'instant.';

  const systemPrompt = `Tu es l'assistant email de Coachello, une plateforme de coaching digital.
Tu aides l'équipe à traiter les emails entrants en les classifiant et en rédigeant des brouillons de réponse.

## Guide de réponse de l'entreprise
${opts.guide || 'Utilise un ton professionnel, chaleureux et concis. Signe toujours avec "L\'équipe Coachello".'}

## Règles de classification prioritaires
${rulesText}

## Critères de classification généraux
- **URGENT** : problème bloquant, insatisfaction forte, délai immédiat requis, client stratégique
- **IMPORTANT** : question commerciale, demande de devis, partenariat, suivi de mission en cours
- **NORMAL** : demande d'information, question générale, demande de démo, nouveau contact
- **FAIBLE** : newsletter, spam probable, email automatique, accusé de réception

## Exemples de réponses validées par l'équipe
${examplesText}

## Instruction de réponse
Réponds UNIQUEMENT en JSON valide, sans markdown autour, avec exactement cette structure :
{
  "classification": "URGENT" | "IMPORTANT" | "NORMAL" | "FAIBLE",
  "reasoning": "Explication courte de la classification (1-2 phrases)",
  "draft_response": "Le brouillon de réponse complet, prêt à être envoyé"
}`;

  const userMessage = `Voici l'email à traiter :

**De :** ${opts.fromName} <${opts.fromEmail}>
**Objet :** ${opts.subject}

**Corps du message :**
${opts.body}

Classifie cet email et rédige un brouillon de réponse approprié.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Réponse Claude inattendue');

  // Parser le JSON retourné par Claude
  const jsonText = content.text.trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
  const result = JSON.parse(jsonText) as ClaudeEmailResult;

  return result;
}
