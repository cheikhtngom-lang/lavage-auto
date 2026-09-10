# Paiement en ligne PayDunya (PER) — Clean Car Galsen

Passerelle de paiement réelle. Remplace la simulation (`setTimeout`) qui
marquait un paiement « effectué » sans rien encaisser.

## Architecture

SPA React (Vite) + Supabase (Postgres/Auth/RLS) + **Edge Functions** (Deno).
Aucun serveur Node/Express. Les clés PayDunya ne vivent que dans les secrets
des Edge Functions, jamais dans le bundle React.

| Élément | Rôle |
|---|---|
| `supabase/functions/_shared/paydunya.ts` | Helpers : `createInvoice`, `confirmInvoice`, `disburse` (PER), `splitLavage`, CORS |
| `supabase/functions/_shared/finalizePayment.ts` | Logique de finalisation (création réservations/transactions + PER, ou activation abonnement/pub/renouvellement), **partagée** entre les deux points d'entrée ci-dessous — idempotente dans les deux cas |
| `supabase/functions/create-lavage-payment/` | Appelée par le client connecté. Crée UNE facture pour un panier de réservations. `verify_jwt = true` |
| `supabase/functions/create-platform-payment/` | Abonnement station (`saas`), Super User (`superuser`), pub (`ad`). 100 % plateforme, pas de redistribution. `verify_jwt = true` |
| `supabase/functions/paydunya-callback/` | **Public** (`verify_jwt = false`). IPN PayDunya : revérifie le statut, encaisse, redistribue |
| `supabase/functions/finalize-paydunya-payment/` | **Public** (`verify_jwt = false`). Filet de secours appelé par le NAVIGATEUR au retour sur `paiement-succes.html` (PayDunya ajoute `?token=`) — fait exactement ce que l'IPN fait, au cas où elle n'arrive jamais. Renvoie aussi le reçu station (logo + coordonnées) pour un lavage |
| `src/lib/paydunya.js` | Côté front : `payLavageOnline()`, `payPlatformOnline()` → redirection PayDunya |
| `add_paydunya_per.sql` | Migration (colonnes, RPC, table `paiements_lavage`) |
| `paiement-succes.html` / `paiement-annule.html` | Pages de retour PayDunya — `paiement-succes.html` revérifie le paiement côté client et télécharge automatiquement le reçu station pour un lavage |

## Modèle financier

- **Lavage** : commission plateforme **10 %** (secret `PLATFORM_DEFAULT_COMMISSION_PERCENT`,
  ou `station_billing.commission_rate` si défini pour la station). Le reste
  est reversé automatiquement à la station sur SON compte PayDunya via
  l'API `disburse` (get-invoice + submit-invoice), `withdraw_mode = paydunya`.
  Le lavage est enregistré dans `transactions` au **montant plein** (comme
  un paiement sur place) ; la commission est tracée à part dans
  `paiements_lavage`.
- **Abonnement / Super User / pub** : 100 % plateforme, aucune redistribution.
  Le callback fait exactement ce que le Super Admin faisait à la main
  (`confirmRenewalPayment` / `confirmSuperUserPayment` / `confirmAdPayment`).
  La confirmation manuelle reste possible en secours si un paiement en
  ligne échoue.

## Flux lavage

**Une réservation en ligne n'existe qu'une fois le paiement confirmé.** Rien
n'est enregistré avant.

1. Client choisit « Payer en ligne » dans le modal de réservation
   (`src/pages/Client/Stations.jsx`).
2. Le front envoie le **panier** (`items = [{ vehicleLabel, category,
   service, amount }]`) à `create-lavage-payment` — aucune réservation créée.
3. La fonction somme les montants, vérifie l'abonnement de la station
   (`station_subscription_ok`) et son alias PayDunya, crée la facture (panier
   dans `custom_data`), renvoie l'URL. Redirection.
4. Le client paie sur PayDunya (Wave / Orange Money / carte).
5. PayDunya appelle `paydunya-callback` (serveur à serveur — l'IPN) **et**
   redirige le navigateur du client vers `paiement-succes.html?token=...`
   (PayDunya ajoute `?token=` tout seul à `PAYDUNYA_RETURN_URL`). Ces deux
   chemins font strictement la même chose (`_shared/finalizePayment.ts`) et
   sont tous les deux nécessaires : si l'IPN n'arrive jamais (URL mal
   configurée, vérification JWT qui la bloque, coupure réseau...), c'est le
   retour du navigateur qui finalise le paiement à la place. Le second à
   passer ne fait rien (verrou unique sur `paydunya_token`).
6. La finalisation : revérifie le statut auprès de PayDunya → insère
   `paiements_lavage` (jeton unique = idempotence) → **crée les réservations
   déjà `paid`** + les `transactions`/reçus → `disburse` la part station →
   met à jour `statut_redistribution` et `reservation_ids`.
7. La réservation apparaît alors dans la file de la station et dans « Mes
   rendez-vous & Reçus » du client. La station retire son solde depuis son
   compte PayDunya quand elle veut. Le client obtient en plus, automatiquement
   sur `paiement-succes.html`, un reçu PDF de la station (logo + coordonnées,
   `src/lib/receipt.js`) — en plus de celui de PayDunya.

Si le client abandonne le paiement : aucune réservation, aucune trace.

## Diagnostiquer « le client a payé mais rien n'apparaît côté station »

1. **`audit_log`** (table Supabase, ou Super Admin > Support > Journal
   d'audit) : chercher les lignes `actor = 'PayDunya'` autour de l'heure du
   paiement. Une ligne `"IPN reçue (...)"` prouve que `paydunya-callback` a
   bien été exécutée — son absence totale est le signe n°1 que **la gateway
   Supabase a rejeté la requête AVANT même d'exécuter le code** (401), très
   probablement parce que la vérification JWT n'est pas réellement désactivée
   pour cette fonction malgré `verify_jwt = false` dans `config.toml`.
2. Vérifier/forcer : Dashboard Supabase > Edge Functions > `paydunya-callback`
   > Details > décocher « Enforce JWT Verification », ou redéployer avec
   `supabase functions deploy paydunya-callback --no-verify-jwt` (idem pour
   `finalize-paydunya-payment`).
3. Grâce au filet de secours ci-dessus, même si l'IPN a échoué, il suffit que
   le client (ou vous) **rouvre l'URL exacte** sur laquelle PayDunya l'a
   redirigé (`paiement-succes.html?token=...`, retrouvable dans son
   historique de navigateur) une fois le correctif déployé — la finalisation
   se rejoue et la réservation apparaît.
4. Sans cette URL, la seule trace du paiement est le dashboard marchand
   PayDunya (le jeton `token` de la facture y est visible) — le rejouer
   nécessite alors une intervention manuelle en base (voir `paiements_lavage`,
   `reservations`, `transactions`).

## Mise en place (à faire une fois)

### 1. Migration SQL

Exécuter `add_paydunya_per.sql` dans l'éditeur SQL Supabase.

### 2. Activer le PER côté PayDunya

Compte **Business** → *Intégrez notre API* → l'application → activer
**Paiement Et Redistribution**. (Validation PayDunya, pas instantané.)

### 3. Secrets Supabase

```bash
supabase secrets set PAYDUNYA_MASTER_KEY=xxxxx
supabase secrets set PAYDUNYA_PRIVATE_KEY=xxxxx
supabase secrets set PAYDUNYA_TOKEN=xxxxx
supabase secrets set PAYDUNYA_MODE=test           # puis "live" en production
supabase secrets set PLATFORM_DEFAULT_COMMISSION_PERCENT=10
supabase secrets set PAYDUNYA_RETURN_URL=https://galsenautocleaner.com/paiement-succes.html
supabase secrets set PAYDUNYA_CANCEL_URL=https://galsenautocleaner.com/paiement-annule.html
```

### 4. Déployer les fonctions

`supabase/config.toml` fixe déjà `verify_jwt = false` pour `paydunya-callback`
et `finalize-paydunya-payment` (toutes deux appelées sans JWT Supabase — la
première par les serveurs PayDunya, la seconde par le navigateur du client).

```bash
supabase functions deploy create-lavage-payment
supabase functions deploy create-platform-payment
supabase functions deploy paydunya-callback
supabase functions deploy finalize-paydunya-payment
```

**Important** : après CE déploiement, vérifier dans le Dashboard Supabase
(Edge Functions > `paydunya-callback` puis `finalize-paydunya-payment` >
Details) que « Enforce JWT Verification » est bien DÉCOCHÉ pour ces deux
fonctions. Le `config.toml` ne suffit pas toujours selon la version du CLI —
c'est la cause n°1 d'un paiement PayDunya réussi côté client mais invisible
côté station (voir section diagnostic plus haut). Si besoin, forcer le flag :

```bash
supabase functions deploy paydunya-callback --no-verify-jwt
supabase functions deploy finalize-paydunya-payment --no-verify-jwt
```

### 5. URL du callback → secret, puis redéploiement

```bash
supabase secrets set PAYDUNYA_CALLBACK_URL=https://kyilblxendvqclifregf.supabase.co/functions/v1/paydunya-callback
supabase functions deploy create-lavage-payment
supabase functions deploy create-platform-payment
```

### 6. Chaque station renseigne son compte PayDunya

Admin > Paramètres > *Paiement en ligne (PayDunya)* → email ou n° mobile
money. Stocké dans `station_billing.paydunya_account_alias` via la fonction
`set_station_paydunya_alias`. Sans ça, ses clients ne peuvent payer que sur
place.

## Points ouverts / à valider en sandbox

- **Format du payload `checkout-invoice/create`** : `store` / `invoice` /
  `actions` / `custom_data` envoyés au niveau racine. Si PayDunya renvoie
  une erreur de structure, déplacer `actions` et `custom_data` dans
  `invoice`.
- **API `disburse`** : flux 2 temps `get-invoice` + `submit-invoice`. Si le
  compte n'a que l'API `direct-pay/credit-account`, adapter `disburse()`
  dans `_shared/paydunya.ts`.
- ~~Content-type du callback~~ **confirmé** (SDK officiels PayDunya, 10/09/2026) :
  toujours `x-www-form-urlencoded`, champ `data` = JSON avec le jeton sous
  `invoice.token` — géré par `paydunya-callback` (branche JSON gardée en
  repli défensif, jamais observée en pratique).
- ~~Forme de la réponse `checkout-invoice/confirm`~~ **confirmée** : `status`
  (`completed` / `pending` / `canceled` / `fail`) ET `custom_data` sont tous
  les deux au niveau RACINE de la réponse (pas sous `invoice`) — ce que le
  code vérifie déjà en premier.
- **Cause n°1 si un paiement réussit côté client sans effet côté station** :
  ce n'est presque jamais un problème de format de payload — c'est que
  `verify_jwt` n'est pas réellement désactivé sur `paydunya-callback` /
  `finalize-paydunya-payment` (la gateway Supabase répond 401 avant même
  d'exécuter le code, donc `audit_log` ne contient rien). Voir section
  diagnostic plus haut.
- **Montant en `transactions`** : montant plein du lavage. Si vous préférez
  que la station voie ce qu'elle reçoit réellement (montant − 10 %),
  changer `amount: it.amount` dans `_shared/finalizePayment.ts` (fonction
  `finalizeLavage`).
