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

## 8. Étape 7 — Liens entrants (backlinks) : le levier n°1 maintenant

Le code est propre et le site est indexable. Ce qui manque à Google pour classer
`galsenautocleaner.com`, c'est la **preuve que d'autres sites le citent**. Objectif :
**2 à 3 nouveaux liens par semaine pendant 2 mois**, jamais 50 d'un coup.

### 8.1 Les 5 règles

1. **Ancre variée.** Le texte cliquable doit être ~60 % « Clean Car Galsen », le reste réparti entre l'URL nue (`galsenautocleaner.com`) et des formules descriptives (« logiciel de gestion pour station de lavage », « plateforme de réservation de lavage auto »). Jamais 10 fois la même ancre exacte → signal de spam.
2. **Cohérence stricte.** Partout le même nom (`Clean Car Galsen`), la même URL (`https://galsenautocleaner.com`, avec `https://`, sans `/` final), la même description (voir 8.4).
3. **Un lien `nofollow` reste utile.** Réseaux sociaux et la plupart des annuaires posent des liens `nofollow` : ils ne transmettent pas de « jus SEO » direct mais amènent la découverte, du trafic et des signaux de marque. On les prend.
4. **Jamais acheter de liens.** Pas de « pack 500 backlinks », pas de fermes de liens, pas d'échange massif → pénalité Google quasi garantie.
5. **Suivi.** Search Console → **Liens → Sites référents** (actualisé ~1×/semaine) et la colonne « Fait » du tableau 8.3.

### 8.2 Plan par vagues

| Vague | Quand | Effort | Contenu |
|---|---|---|---|
| **1 — Vos propres comptes** | aujourd'hui | 20 min | LinkedIn, Facebook, Instagram, signature e-mail |
| **2 — Profils entreprise gratuits** | cette semaine | ~2 h | Crunchbase, SaaSHub, AlternativeTo, Capterra/GetApp, G2, StackShare |
| **3 — Annuaires Sénégal / Afrique** | cette semaine | ~2 h | GoAfrica, Expat-Dakar, annuaire-senegal, VC4A, Afrikatech, Disrupt Africa |
| **4 — Presse & partenaires** | 2 à 4 semaines | variable | médias tech sénégalais + liens depuis les stations clientes |

### 8.3 Tableau de suivi (à cocher au fur et à mesure)

| # | Cible | URL de soumission | Vague | Lien posé ? |
|---|---|---|---|---|
| 1 | LinkedIn – page entreprise (champ « Site web » + post épinglé) | linkedin.com/company/144611952 | 1 | ☐ |
| 2 | Facebook – page (section Infos + 1 publication) | web.facebook.com/bustane11 | 1 | ☐ |
| 3 | Instagram – lien en bio | instagram.com/saasbycheikh | 1 | ☐ |
| 4 | Signature e-mail (Gmail → Paramètres → Signature) | — | 1 | ☐ |
| 5 | Crunchbase – profil société | crunchbase.com/register | 2 | ☐ |
| 6 | SaaSHub | saashub.com/submit | 2 | ☐ |
| 7 | AlternativeTo | alternativeto.net/manage/add-application | 2 | ☐ |
| 8 | Capterra / GetApp – fiche éditeur gratuite | vendors.capterra.com | 2 | ☐ |
| 9 | G2 – profil vendeur gratuit | g2.com/products/new | 2 | ☐ |
| 10 | StackShare | stackshare.io/tools/new | 2 | ☐ |
| 11 | GoAfrica (annuaire pro Afrique de l'Ouest) | goafricaonline.com | 3 | ☐ |
| 12 | Expat-Dakar – rubrique Services / Informatique | expat-dakar.com | 3 | ☐ |
| 13 | Annuaire-Senegal | annuaire-senegal.com | 3 | ☐ |
| 14 | VC4A – profil startup | vc4a.com | 3 | ☐ |
| 15 | Afrikatech | afrikatech.com | 3 | ☐ |
| 16 | Disrupt Africa – submit startup | disrupt-africa.com/submit-startup | 3 | ☐ |
| 17 | Product Hunt – lancement (à préparer) | producthunt.com/posts/new | 2/4 | ☐ |
| 18 | Social Net Link (média tech SN) – pitch e-mail | socialnetlink.org | 4 | ☐ |
| 19 | TechCabal / WeAreTech Africa – pitch e-mail | techcabal.com | 4 | ☐ |
| 20 | Stations clientes – lien depuis leur site / page FB / fiche Google | — | 4 | ☐ |

> Google Business Profile : **non éligible** (éditeur de logiciel, pas de lieu accueillant du public). Ne pas tenter.

### 8.4 Textes prêts à coller

**Nom :** `Clean Car Galsen`
**URL :** `https://galsenautocleaner.com`
**Éditeur :** Bustane Holding — Entreprise Individuelle, RCCM SN.DKR.2022.A.296, NINEA 009100554, Rufisque / ZAC Mbao, Sénégal.
**Catégories :** SaaS · Automobile · File d'attente / Booking · Fintech (paiement mobile)

**Slogan (1 ligne) :**
> Le logiciel qui digitalise les stations de lavage auto au Sénégal.

**Description courte (~150 caractères — annuaires) :**
> Clean Car Galsen digitalise les stations de lavage auto : file d'attente virtuelle, réservation en ligne, planning des laveurs, paiement Wave / Orange Money.

**Description moyenne (~300 caractères) :**
> Clean Car Galsen est une plateforme SaaS sénégalaise pour les stations de lavage automobile. Elle gère la file d'attente virtuelle, la réservation en ligne, le suivi du lavage en temps réel, le planning et le pointage des laveurs, la comptabilité et l'encaissement par Wave ou Orange Money — sans commission sur les lavages. Essai gratuit d'un mois, sans engagement.

**Description longue (~700 caractères — Crunchbase, G2, Product Hunt) :**
> Clean Car Galsen aide les stations de lavage automobile au Sénégal à passer du carnet papier à un poste de commande numérique. Les automobilistes réservent un créneau en ligne et suivent l'avancement de leur lavage en direct ; la station pilote sa file d'attente, estime les temps d'attente, planifie et pointe ses laveurs (y compris les affectations à plusieurs laveurs pour les gros véhicules), tient sa comptabilité (dépenses, objectifs de recette) et encaisse par Wave ou Orange Money directement sur son compte marchand, sans commission sur les lavages. Trois forfaits mensuels sans engagement (Starter 10 000, Pro 20 000, Business 35 000 FCFA), précédés d'un mois d'essai gratuit. Aucun matériel à acheter : tout fonctionne dans le navigateur.

**Ancres de lien à alterner :**
`Clean Car Galsen` · `galsenautocleaner.com` · `logiciel de gestion pour station de lavage` · `plateforme de réservation de lavage auto` · `Clean Car Galsen, le SaaS des stations de lavage`

**Post LinkedIn / Facebook (annonce) :**
> 🚗💧 Clean Car Galsen est en ligne : galsenautocleaner.com
>
> Le logiciel qui fait passer les stations de lavage auto du carnet papier au numérique :
> • File d'attente virtuelle + réservation en ligne
> • Suivi du lavage en direct pour le client
> • Planning et pointage des laveurs
> • Comptabilité et encaissement Wave / Orange Money, sans commission
>
> 1 mois d'essai gratuit, sans engagement, sans matériel à acheter.
> 👉 https://galsenautocleaner.com

**Message aux stations déjà clientes (demande de lien) :**
> Bonjour [nom], pouvez-vous ajouter un lien « Réservez en ligne » vers https://galsenautocleaner.com sur votre page Facebook (section Infos → Site web) et, si vous en avez un, sur votre site ou votre fiche Google ? Ça aide vos clients à vous trouver et à réserver. Merci !

**Pitch e-mail presse (objet + corps) :**
> Objet : Un SaaS sénégalais digitalise les stations de lavage auto
>
> Bonjour,
> Clean Car Galsen (galsenautocleaner.com) est une plateforme 100 % sénégalaise qui équipe les stations de lavage automobile : file d'attente virtuelle, réservation en ligne, planning des laveurs, encaissement Wave / Orange Money sans commission. Éditée par Bustane Holding (Rufisque). Je peux vous fournir chiffres, captures et un accès démo si le sujet vous intéresse.
> Cordialement, [nom] — [téléphone]

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
