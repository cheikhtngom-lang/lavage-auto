# Référencement (SEO) — Clean Car Galsen

Domaine : **https://galsenautocleaner.com** · Hébergement : Vercel · Cible prioritaire : **gérants de station de lavage (B2B)**

---

## 1. Ce qui a été corrigé dans le code (fait le 2026-09-01)

| Fichier | Changement |
|---|---|
| `vercel.json` | Supprimé le renvoi `/(.*) → /index.html` qui transformait **toute URL inconnue en fausse page 200** (« soft 404 »). Vercel sert maintenant `404.html` avec un vrai code 404. |
| `dashboard.html` | Ajout de `<meta name="robots" content="noindex, follow">` — la coquille React n'a aucun contenu à indexer. |
| `index.html` | `<title>` + meta description réorientés **B2B** (« logiciel de gestion pour station de lavage auto au Sénégal »). Balises OpenGraph/Twitter alignées. |
| `index.html` | Données structurées refaites : `Organization` + `SoftwareApplication` (3 offres tarifaires) + `WebSite` + **`FAQPage`** (extrait riche possible dans Google). L'ancien `LocalBusiness` (faux, pas de local physique) a été retiré. |
| `public/sitemap.xml` | Nettoyé : ne liste plus `/login`, `/dashboard`, `/stations` (non indexables). Dates à jour. |
| `public/robots.txt` | Simplifié. Bloque seulement `/admin/` et `/superadmin/`. |
| GA4 | Le script Google Analytics avec l'ID bidon `G-XXXXXXXXXX` a été **commenté** partout (il chargeait un script inutile sur chaque page). À réactiver une fois la propriété GA4 créée — voir §5. |
| `index.html` | Emplacement prêt pour la balise de vérification Search Console (commentée, en haut du `<head>`). |

> Après un `git push`, Vercel redéploie automatiquement. Vérifier ensuite :
> `https://galsenautocleaner.com/sitemap.xml` et `https://galsenautocleaner.com/robots.txt` s'affichent bien,
> et une URL au hasard (`https://galsenautocleaner.com/nimportequoi`) renvoie la page 404.

---

## 2. Étape 1 — Google Search Console (le plus important)

C'est l'outil qui dit à Google « ce site existe, indexe-le », et qui montre ensuite sur quelles recherches on apparaît.

### 2.1 Créer la propriété

1. Aller sur **https://search.google.com/search-console** (se connecter avec le compte Google `cheikhtngom@gmail.com`).
2. Cliquer **Ajouter une propriété**.
3. Choisir le type **« Domaine »** (colonne de gauche) et saisir : `galsenautocleaner.com`
   → couvre `http`, `https`, `www` et tous les sous-domaines d'un coup. C'est le choix recommandé.
4. Google affiche un **enregistrement TXT** à ajouter au DNS, du type :
   `google-site-verification=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2.2 Ajouter l'enregistrement TXT au DNS

**Où sont gérés les DNS de `galsenautocleaner.com` ?**

- **Si le domaine est géré par Vercel** (Vercel → projet → *Settings* → *Domains*, le domaine apparaît avec « Vercel » comme nameserver) :
  1. Vercel → *Settings* → *Domains* → cliquer sur `galsenautocleaner.com` → onglet **DNS Records**.
  2. *Add* → Type : `TXT` · Name : `@` · Value : `google-site-verification=xxxx…` · TTL : défaut.
  3. Enregistrer.

- **Si le domaine est chez un registrar** (Namecheap, GoDaddy, OVH, Gandi, Hostinger, LWS…) :
  1. Se connecter au registrar → zone DNS de `galsenautocleaner.com`.
  2. Ajouter un enregistrement : Type `TXT`, Hôte/Name `@` (ou vide, ou `galsenautocleaner.com` selon l'interface), Valeur = la chaîne complète `google-site-verification=xxxx…`.
  3. Enregistrer.

### 2.3 Valider

- Attendre **5 min à 1 h** (parfois jusqu'à 24 h) que le DNS se propage.
- Revenir dans Search Console → **Valider**.
- Vérif manuelle possible en ligne de commande : `nslookup -type=TXT galsenautocleaner.com` doit lister la valeur `google-site-verification=…`.

> **Alternative sans DNS** (si accès DNS impossible) : dans Search Console, choisir plutôt une propriété **« Préfixe de l'URL »** = `https://galsenautocleaner.com`, méthode **« Balise HTML »**. Coller la balise fournie dans `index.html`, à la place de la ligne commentée :
> `<!-- <meta name="google-site-verification" content="VOTRE_CODE_ICI"> -->`
> (retirer les `<!-- -->`), puis `git push`, attendre le redéploiement Vercel, puis *Valider*. La vérification par balise HTML ne couvre que cette URL exacte — la méthode « Domaine » par DNS reste préférable.

---

## 3. Étape 2 — Soumettre le sitemap

1. Search Console → menu de gauche → **Sitemaps**.
2. Champ « Ajouter un sitemap » : saisir `sitemap.xml` → **Envoyer**.
3. Statut attendu sous quelques heures : **« Réussite »**, 3 URL découvertes.

---

## 4. Étape 3 — Forcer l'indexation de la page d'accueil

1. Search Console → barre du haut : **Inspection de l'URL** → coller `https://galsenautocleaner.com/`.
2. Attendre l'analyse → cliquer **« Demander une indexation »**.
3. Répéter pour `https://galsenautocleaner.com/conditions-generales.html` et `/confidentialite.html` (facultatif, moins prioritaire).

L'indexation prend de **quelques heures à ~2 semaines** pour un domaine neuf. Suivre l'avancement dans **Indexation → Pages**.

Test rapide « suis-je déjà dans Google ? » : rechercher `site:galsenautocleaner.com` dans Google.

---

## 5. Étape 4 — Google Analytics 4 (mesure d'audience)

Pas indispensable au référencement, mais nécessaire pour savoir ce qui marche.

1. **https://analytics.google.com** → *Admin* → *Créer* → *Propriété*. Nom : `Clean Car Galsen`, fuseau `(GMT+00:00) Dakar`, devise `XOF`.
2. *Flux de données* → *Web* → URL `https://galsenautocleaner.com` → créer.
3. Copier l'**ID de mesure** (format `G-XXXXXXXXXX`).
4. Dans le code : décommenter le bloc Google Analytics et remplacer `G-XXXXXXXXXX` par l'ID réel dans **les 4 fichiers** :
   `index.html`, `login.html`, `reset-password.html`, `dashboard.html`.
5. `git push` → redéploiement Vercel.
6. Dans Search Console → *Paramètres* → **Associations** → associer la propriété GA4 (permet de croiser recherches Google et comportement sur le site).

---

## 6. Étape 5 — Bing / autres moteurs

1. **https://www.bing.com/webmasters** → se connecter → *Importer depuis Google Search Console* (récupère la propriété et le sitemap en un clic).
2. Bing alimente aussi DuckDuckGo, Ecosia, Yahoo.

---

## 7. Étape 6 — Suivi hebdomadaire (10 min)

Dans Search Console :

| Rapport | Ce qu'on regarde |
|---|---|
| **Indexation → Pages** | Les pages passent bien en « Indexées ». Corriger toute « exclue » anormale. |
| **Résultats de recherche → Performances** | Requêtes qui rapportent des impressions/clics. Position moyenne qui progresse. |
| **Expérience → Signaux web essentiels** (Core Web Vitals) | Rester dans le vert. Rouge = voir §9 (perf Tailwind). |
| **Améliorations → FAQ / Éléments enrichis** | Confirmer que le `FAQPage` est détecté sans erreur. |

Outils ponctuels :
- **https://pagespeed.web.dev** → tester `galsenautocleaner.com` (viser > 90 sur mobile).
- **https://search.google.com/test/rich-results** → tester la home (doit détecter Organization, SoftwareApplication, FAQPage).

---

## 8. Étape 7 — Hors-site (ce qui fait vraiment monter en B2B)

Le code est propre ; le classement se gagne maintenant surtout par la notoriété et les liens entrants.

- **LinkedIn** : la page entreprise existe déjà (id `144611952`). Publier régulièrement (démos produit, cas station). Mettre le lien `galsenautocleaner.com` dans la bio.
- **Annuaires / places de marché Sénégal & Afrique** : GoAfrica, Expat-Dakar (rubrique services/pro), Sénégalindex, Dakarville, annuaires SaaS africains (Briter, VC4A, Disrupt Africa directory). Chaque fiche = un backlink.
- **Presse tech** : proposer un article à SenePlus / Social Net Link / Osiris / We Are Tech Africa (« un SaaS sénégalais digitalise les stations de lavage »).
- **Bouche-à-oreille numérique** : demander aux stations déjà clientes un avis Google + un lien depuis leur page Facebook.
- **Pas de Google Business Profile** : réservé aux activités avec adresse physique ou zone de service. Non applicable ici (SaaS 100 % en ligne).

### Mots-clés B2B à viser (à travailler dans le contenu)

- logiciel gestion station de lavage / logiciel car wash
- gérer la file d'attente d'une station de lavage
- digitaliser une station de lavage auto Sénégal / Dakar
- application réservation lavage auto
- logiciel pointage laveurs / planning station lavage
- encaissement Wave Orange Money station de lavage

---

## 9. Optimisations code encore possibles (à arbitrer)

À décider ensemble — non fait pour l'instant :

1. **Remplacer `cdn.tailwindcss.com` (CDN « play »)** par un CSS Tailwind compilé sur `index.html` / `login.html`. Le CDN génère le CSS dans le navigateur : c'est lourd et bloquant → pénalise le score mobile PageSpeed et les Core Web Vitals. Gain SEO réel.
2. **Page dédiée `/pour-les-stations`** (ou refonte du hero) 100 % B2B : aujourd'hui le titre de l'onglet est B2B mais le grand titre visible (`<h1>` « Votre lavage de confiance à Dakar ») s'adresse encore aux automobilistes. Un `<h1>` du type « Le logiciel qui digitalise votre station de lavage » renforcerait la cohérence pour Google **et** la conversion des gérants.
3. **Blog / ressources** (`/blog/…`) : 1 article utile par mois sur les mots-clés ci-dessus. C'est le principal levier pour ranker sur des requêtes longues en B2B.
4. **Compresser / différer la vidéo hero** (`hero-wash.mp4`, 3,1 Mo) : `preload="none"`, voire une version WebM plus légère.
5. **`width`/`height` explicites** sur les images générées (marquee stations) pour éviter le décalage de mise en page (CLS).
