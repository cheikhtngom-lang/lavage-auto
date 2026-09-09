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
| `supabase/functions/create-lavage-payment/` | Appelée par le client connecté. Crée UNE facture pour un panier de réservations. `verify_jwt = true` |
| `supabase/functions/create-platform-payment/` | Abonnement station (`saas`), Super User (`superuser`), pub (`ad`). 100 % plateforme, pas de redistribution. `verify_jwt = true` |
| `supabase/functions/paydunya-callback/` | **Public** (`verify_jwt = false`). IPN PayDunya : revérifie le statut, encaisse, redistribue |
| `src/lib/paydunya.js` | Côté front : `payLavageOnline()`, `payPlatformOnline()` → redirection PayDunya |
| `add_paydunya_per.sql` | Migration (colonnes, RPC, table `paiements_lavage`) |
| `paiement-succes.html` / `paiement-annule.html` | Pages de retour PayDunya |

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

1. Client choisit « Payer en ligne » dans le modal de réservation
   (`src/pages/Client/Stations.jsx`).
2. Le front crée la/les réservation(s) **non payées**, récupère leurs ids,
   appelle `create-lavage-payment`.
3. La fonction resomme les montants, vérifie l'abonnement de la station
   (`station_subscription_ok`) et son alias PayDunya, crée la facture,
   renvoie l'URL. Redirection.
4. Le client paie sur PayDunya (Wave / Orange Money / carte).
5. PayDunya appelle `paydunya-callback` (serveur à serveur).
6. Le callback : revérifie le statut → insère `paiements_lavage` (jeton
   unique = idempotence) → marque les réservations `paid`, crée les
   `transactions` → `disburse` la part station → met à jour
   `statut_redistribution`.
7. La station retire son solde depuis son propre compte PayDunya, quand
   elle veut.

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

`supabase/config.toml` fixe déjà `verify_jwt = false` pour `paydunya-callback`.

```bash
supabase functions deploy create-lavage-payment
supabase functions deploy create-platform-payment
supabase functions deploy paydunya-callback
```

Si le CLI ignore/refuse le `config.toml` minimal, forcer le flag :

```bash
supabase functions deploy paydunya-callback --no-verify-jwt
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
- **Content-type du callback** : géré en `x-www-form-urlencoded` (champ
  `data`) ET en JSON. À confirmer selon la version d'API PayDunya.
- **Montant en `transactions`** : montant plein du lavage. Si vous préférez
  que la station voie ce qu'elle reçoit réellement (montant − 10 %),
  changer `amount: r.amount` dans `paydunya-callback` (fonction
  `handleLavage`).
