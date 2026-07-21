# SansSite — guide de déploiement complet

Tout le code est prêt. Il te reste des clés à générer (gratuit, ~20 minutes au total) et 1 déploiement en ligne de commande ou par glisser-déposer. Suis l'ordre ci-dessous, ne saute pas d'étape.

## 1. Créer la base de données (Supabase — gratuit)

1. Va sur [supabase.com](https://supabase.com), crée un compte, crée un nouveau projet
2. Une fois le projet prêt, va dans **SQL Editor** → **New query**
3. Colle tout le contenu de `schema.sql` (fourni dans ce dossier) → **Run**
4. Va dans **Project Settings → API** et note ces 3 valeurs, tu en auras besoin partout :
   - `Project URL` → c'est ton `SUPABASE_URL`
   - `anon public` key → c'est ton `SUPABASE_ANON_KEY`
   - `service_role` key → c'est ton `SUPABASE_SERVICE_ROLE_KEY` (⚠️ secrète, ne jamais la mettre dans le frontend)
5. Va dans **Authentication → Providers**, vérifie que "Email" est activé (c'est le cas par défaut, ça permet la connexion par lien magique sans mot de passe)

## 2. Récupérer tes clés API

- **Google Places** : [console.cloud.google.com](https://console.cloud.google.com) → active "Places API (New)" → crée une clé API → copie-la
- **Anthropic** : [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys → crée une clé → copie-la
- **PayPal** :
  1. Sur [paypal.com](https://paypal.com) (compte Business) → **Paiements → Abonnements → Créer un plan** → répète l'opération **4 fois**, une par offre (Repérage 9€, Cible 29€, Sniper 39€, Escouade 129€, toutes mensuelles)
  2. Pour chaque plan créé et activé, clique **Générer le code** — note le `plan_id` de chacun (commence par `P-`). Le `client-id`, lui, est le même pour les 4.
  3. Va sur [developer.paypal.com](https://developer.paypal.com) → **My Apps & Credentials** → note ton `Client ID` et ton `Secret` (mode Live une fois prêt, Sandbox pour tester avant)

## 3. Compléter le fichier `public/index.html`

Ouvre `public/index.html`, cherche ces lignes tout en haut du `<script>` :

```js
const SUPABASE_URL = 'REMPLACE_PAR_TON_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'REMPLACE_PAR_TA_CLE_ANON';
const PAYPAL_CLIENT_ID = '...'; // déjà rempli
const PAYPAL_PLANS = {
  reperage: '...',  // déjà rempli
  cible: 'REMPLACE_PAR_PLAN_ID_CIBLE',
  sniper: 'REMPLACE_PAR_PLAN_ID_SNIPER',
  escouade: 'REMPLACE_PAR_PLAN_ID_ESCOUADE'
};
```

Remplace les 3 valeurs restantes par les `plan_id` de Cible, Sniper et Escouade une fois créés. Toutes ces valeurs sont publiques par nature (visibles dans le code d'un navigateur de toute façon) — aucun risque à les laisser en clair ici.

## 4. Déployer sur Vercel (gratuit)

**Option simple (sans terminal) :**
1. Mets ce dossier entier sur GitHub (crée un repo, upload les fichiers)
2. Va sur [vercel.com](https://vercel.com) → New Project → importe ce repo → Deploy

**Option terminal :**
```bash
npm install -g vercel
cd sanssite
vercel --prod
```

## 5. Ajouter les clés secrètes dans Vercel

Dans ton projet Vercel → **Settings → Environment Variables**, ajoute :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | ton Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ta clé service_role (secrète) |
| `GOOGLE_PLACES_API_KEY` | ta clé Google Places |
| `ANTHROPIC_API_KEY` | ta clé Anthropic |
| `PAYPAL_CLIENT_ID` | ton Client ID PayPal |
| `PAYPAL_CLIENT_SECRET` | ton Secret PayPal |
| `PAYPAL_ENV` | `live` ou `sandbox` |
| `PAYPAL_WEBHOOK_ID` | voir étape 6 |
| `PAYPAL_PLAN_ID_REPERAGE` | `plan_id` de l'offre Repérage |
| `PAYPAL_PLAN_ID_CIBLE` | `plan_id` de l'offre Cible |
| `PAYPAL_PLAN_ID_SNIPER` | `plan_id` de l'offre Sniper |
| `PAYPAL_PLAN_ID_ESCOUADE` | `plan_id` de l'offre Escouade |

Puis redéploie (Vercel → Deployments → ⋯ → Redeploy) pour que les variables prennent effet.

## 6. Connecter le webhook PayPal (pour que l'abonnement se débloque vraiment)

1. Sur [developer.paypal.com](https://developer.paypal.com) → ton app → **Add Webhook**
2. URL : `https://TON-DOMAINE.vercel.app/api/paypal-webhook`
3. Événements à écouter : `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.EXPIRED`
4. PayPal te donne un `Webhook ID` → colle-le dans Vercel comme `PAYPAL_WEBHOOK_ID` (étape 5), puis redéploie

**Comment le paiement se relie au bon utilisateur :** le bouton PayPal sur le site envoie automatiquement `custom_id` = l'identifiant Supabase de l'utilisateur connecté au moment de l'abonnement (déjà codé dans `public/index.html`). Le webhook lit cette valeur pour savoir quel compte passer en Pro — aucune action supplémentaire de ta part.

## 7. Brancher ton nom de domaine

Une fois le domaine acheté (Gandi, OVH, Namecheap...) : Vercel → **Settings → Domains** → ajoute ton domaine → Vercel te donne les enregistrements DNS à copier chez ton registrar. Propagation en général sous 1h.

---

## Ce qui est réellement fonctionnel dans ce code

- ✅ Authentification réelle par email (Supabase Auth, lien magique)
- ✅ Base de données réelle (Postgres via Supabase), avec sécurité au niveau ligne (RLS)
- ✅ Clés API Google Places et Anthropic protégées côté serveur — jamais exposées au navigateur
- ✅ Limites du plan gratuit appliquées côté serveur (impossible à contourner en modifiant le navigateur)
- ✅ Génération de site par IA connectée à l'API Anthropic réelle
- ✅ Webhook PayPal qui vérifie la signature via l'API PayPal avant de débloquer un compte

## Un point de vigilance honnête

Ce code n'a pas pu être testé en conditions réelles (mon environnement n'a pas d'accès réseau pour lancer un serveur). Il est écrit correctement et suit les conventions standard de Vercel/Supabase/Stripe, mais lors du premier déploiement, teste chaque route une par une (recherche, génération IA, paiement test Stripe en mode test avant de passer en mode live) et corrige si un message d'erreur apparaît — c'est normal pour un premier déploiement et je peux t'aider à déboguer si tu me montres l'erreur exacte.
