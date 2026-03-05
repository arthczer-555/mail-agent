# Coachello Email Agent

Agent email autonome : lit Gmail, classifie avec Claude, propose des brouillons, l'équipe valide.

---

## Architecture

```
Netlify (plan gratuit)
├── Frontend React (dashboard de validation)
├── Netlify Functions (API endpoints)
└── poll-emails — fonction HTTP manuelle (cron auto disponible sur Netlify Pro)

Supabase (PostgreSQL gratuit)
└── Base de données (emails, guide, exemples, règles)
```

---

## Mise en place (une seule fois)

### 1. Supabase — Base de données

1. Créer un compte sur [supabase.com](https://supabase.com) (gratuit)
2. Créer un nouveau projet PostgreSQL
3. Dans l'onglet **SQL Editor**, coller et exécuter le contenu de `schema.sql`
4. Aller dans **Project Settings → Database → Transaction pooler**
5. Copier la connection string au format `postgres://postgres.xxxx:[PASSWORD]@...pooler.supabase.com:6543/postgres`
   → c'est votre `DATABASE_URL` (**port 6543**, pas 5432)

---

### 2. Google Cloud — Credentials Gmail

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com)
2. Créer un nouveau projet (ex : "Coachello Email Agent")
3. Activer l'**API Gmail** : APIs & Services → Enable APIs → Gmail API
4. Créer des credentials OAuth 2.0 :
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Application type : **Web application**
   - Authorized redirect URIs : `https://developers.google.com/oauthplayground`
5. Copier le `Client ID` et le `Client Secret`

**Obtenir le Refresh Token :**
1. Aller sur [developers.google.com/oauthplayground](https://developers.google.com/oauthplayground)
2. Cliquer sur l'engrenage ⚙️ → cocher "Use your own OAuth credentials"
3. Entrer votre Client ID et Client Secret
4. Dans le champ de gauche, chercher "Gmail API v1" → sélectionner `https://mail.google.com/`
5. Cliquer "Authorize APIs" → se connecter avec la boîte partagée
6. Cliquer "Exchange authorization code for tokens"
7. Copier le **Refresh token**

---

### 3. Anthropic — Clé API Claude

1. Aller sur [platform.anthropic.com](https://platform.anthropic.com)
2. Créer un compte et ajouter des crédits (5$ suffisent pour démarrer)
3. API Keys → Create Key → copier la clé `sk-ant-...`

---

### 4. GitHub — Dépôt du projet

```bash
git init
git add .
git commit -m "Initial commit — Coachello Email Agent"
git remote add origin https://github.com/TON_USERNAME/coachello-email-agent.git
git push -u origin main
```

---

### 5. Netlify — Déploiement

1. Aller sur [netlify.com](https://netlify.com) → s'inscrire (plan gratuit suffisant pour tester)
2. **New site from Git** → connecter GitHub → sélectionner le dépôt
3. Build settings (détectés automatiquement depuis `netlify.toml`) :
   - Build command : `npm run build`
   - Publish directory : `dist`
4. Cliquer **Deploy site**

**Variables d'environnement** (Site Settings → Environment Variables) :

| Variable              | Valeur                                                        |
|-----------------------|---------------------------------------------------------------|
| `DATABASE_URL`        | Connection string Supabase Transaction pooler (port **6543**) |
| `GMAIL_CLIENT_ID`     | ID OAuth Google                                               |
| `GMAIL_CLIENT_SECRET` | Secret OAuth Google                                           |
| `GMAIL_REFRESH_TOKEN` | Refresh token obtenu via OAuth Playground                     |
| `GMAIL_ADDRESS`       | Adresse Gmail surveillée (ex: contact@coachello.io)           |
| `ANTHROPIC_API_KEY`   | `sk-ant-...`                                                  |

Après avoir ajouté les variables : **Trigger deploy** → le site est en ligne.

---

### 6. Domaine personnalisé (optionnel)

Dans Netlify : Domain Settings → Add custom domain → `agent.coachello.io`

---

## Utilisation au quotidien

### Dashboard
- Accéder via l'URL Netlify
- 4 colonnes : Urgent (rouge) / Important (orange) / Normal (jaune) / Faible (vert)
- Cliquer sur un email pour voir l'email original + le brouillon proposé
- Valider, Modifier ou Rejeter

### Déclencher le polling Gmail (plan gratuit)

Sur le plan gratuit, le polling n'est pas automatique. Pour lancer une collecte :

```
GET https://ton-site.netlify.app/.netlify/functions/poll-emails
```

Ouvrir cette URL dans le navigateur, ou l'appeler via curl/Postman. Les nouveaux emails apparaissent ensuite dans le dashboard.

### Administration
- **Guide & Exemples** : uploader ou éditer le document de référence (.docx ou texte), télécharger le guide actuel, gérer les emails d'exemple utilisés par Claude
- **Règles** : définir des règles de classification automatique par expéditeur, domaine ou mot-clé

---

## Structure des fichiers

```
coachello-email-agent/
├── netlify/functions/
│   ├── _db.ts              ← Helper connexion Supabase (postgres.js)
│   ├── _gmail.ts           ← Helper client Gmail
│   ├── _claude.ts          ← Helper appel Claude (claude-sonnet-4-6)
│   ├── poll-emails.mts     ← Polling Gmail — manuel (plan gratuit) / cron sur Pro
│   ├── get-emails.mts      ← GET /api/emails
│   ├── email-action.mts    ← POST /api/emails/:id/:action
│   ├── upload-guide.mts    ← GET/POST /api/guide
│   ├── manage-examples.mts ← GET/POST/DELETE /api/examples
│   └── manage-rules.mts    ← GET/POST/DELETE /api/rules
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── index.css
│   ├── types.ts
│   └── components/
│       ├── Dashboard.tsx
│       ├── EmailCard.tsx
│       ├── EmailDetail.tsx
│       └── AdminPanel.tsx   ← Guide + Exemples fusionnés
├── schema.sql
├── netlify.toml
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vite.config.ts
└── index.html
```

---

## Passer en production (Netlify Pro)

Pour activer le polling automatique toutes les 20 minutes :

1. Upgrader vers Netlify Pro ($19/mois) dans les billing settings
2. Dans `netlify.toml`, décommenter :
   ```toml
   [functions."poll-emails"]
     schedule = "*/20 * * * *"
   ```
3. Dans `netlify/functions/poll-emails.mts`, décommenter :
   ```typescript
   export const config: Config = { schedule: '*/20 * * * *' };
   ```
   Et réactiver l'import en haut du fichier :
   ```typescript
   import type { Config } from '@netlify/functions';
   ```
4. Push → redéploiement automatique

---

## Migration vers Railway (si nécessaire un jour)

Si le volume dépasse les 15 min par run :

1. Créer un compte Railway → nouveau projet → connecter le même dépôt GitHub
2. Convertir les Netlify Functions en routes FastAPI (Python) ou Express (Node)
3. Convertir le polling en script avec `node-cron` ou `APScheduler`
4. Changer l'URL de l'API dans les variables d'environnement du frontend Netlify
5. La base Supabase **ne change pas** — même `DATABASE_URL`

Migration estimée : 2-3 heures de développement.

---

## Coûts estimés

### Phase test (plan gratuit)

| Service        | Coût mensuel             |
|----------------|--------------------------|
| Netlify Free   | Gratuit                  |
| Supabase Free  | Gratuit                  |
| Claude Sonnet  | ~3€ pour 300 emails/mois |
| Google Cloud   | Gratuit                  |
| **Total**      | **~3€/mois**             |

### Production (cron automatique)

| Service        | Coût mensuel             |
|----------------|--------------------------|
| Netlify Pro    | $19/mois                 |
| Supabase Free  | Gratuit                  |
| Claude Sonnet  | ~3€ pour 300 emails/mois |
| Google Cloud   | Gratuit                  |
| **Total**      | **~22€/mois**            |
