# Mot de passe oublié — fonctionnement et réglage Supabase

## Ce que voit l'utilisateur (page `/forgot-password.html`)

Même principe que GestionImmo : une seule page en deux blocs.

1. **Recevoir le code** — l'utilisateur saisit son e-mail et clique sur « Recevoir le code par e-mail ».
2. **Valider** — il saisit le **code** reçu par e-mail, son nouveau mot de passe (deux fois) et clique sur
   « Valider le nouveau mot de passe ». Le mot de passe est changé, la session temporaire est fermée, et
   il est renvoyé vers la connexion.

Détails :

- La réponse est toujours la même que le compte existe ou non (on ne révèle jamais si une adresse a un compte).
- Après l'envoi, le bouton devient « Renvoyer le code (60 s) » : Supabase n'autorise qu'une demande par minute et par adresse.
- Les erreurs Supabase (anglais) sont traduites en français : code invalide/expiré, trop de demandes, mot de passe identique à l'ancien, etc. (`friendlyAuthError` dans `src/lib/accounts.js`).
- Le code est numérique ; la page accepte de 6 à 10 chiffres, quelle que soit la longueur réglée dans Supabase.
- **Secours** : l'e-mail contient aussi un lien, qui mène à `/reset-password.html` (choix du nouveau mot de passe sans saisir de code).

## Réglage à faire UNE FOIS dans Supabase (sinon l'e-mail n'a pas de code)

Le code vient du modèle d'e-mail « Reset Password » de Supabase, qui doit contenir la variable `{{ .Token }}`.
Supabase ne permet pas de le régler depuis le code du site : à faire dans le tableau de bord.

1. Tableau de bord Supabase → votre projet → **Authentication** → **Emails** (ou *Email Templates*).
2. Ouvrir le modèle **Reset Password** (« Réinitialiser le mot de passe »).
3. **Subject** : `Votre code de réinitialisation Clean Car Galsen`
4. **Message body** (remplacer tout le contenu par ce qui suit), puis **Save** :

```html
<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
  <h1 style="font-size:20px;color:#2563eb;">Réinitialisation de votre mot de passe</h1>
  <p style="font-size:15px;line-height:1.5;">
    Voici votre code de sécurité. Saisissez-le sur la page « Mot de passe oublié »,
    avec votre nouveau mot de passe :
  </p>
  <p style="margin:24px 0;text-align:center;">
    <span style="display:inline-block;font-size:32px;letter-spacing:8px;font-weight:700;background:#f1f5f9;border-radius:12px;padding:14px 22px;color:#0f172a;">{{ .Token }}</span>
  </p>
  <p style="font-size:13px;color:#666;line-height:1.5;">
    Ce code n'est valable que quelques minutes. Si vous n'êtes pas à l'origine de cette demande,
    ignorez cet e-mail : votre mot de passe ne change pas.
  </p>
  <p style="font-size:13px;color:#666;">
    Vous préférez un lien ? <a href="{{ .ConfirmationURL }}" style="color:#2563eb;">Choisir un nouveau mot de passe</a>
  </p>
  <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
</div>
```

Réglages associés (même zone, section *Sign In / Providers* → *Email*) :

- **Email OTP Expiration** : durée de validité du code (3600 s par défaut ; 900 s = 15 min est plus prudent).
- **Email OTP Length** : longueur du code (6 à 10 chiffres). La page s'adapte.

## Si les e-mails n'arrivent pas

- Vérifier les courriers indésirables.
- L'envoi par défaut de Supabase est très limité en volume (quelques e-mails par heure pour tout le projet).
  Si des utilisateurs signalent des e-mails manquants ou l'erreur « trop de demandes », brancher un SMTP
  personnalisé (Resend, déjà utilisé pour les autres e-mails du site) : **Authentication → Emails → SMTP Settings**.

## Fichiers

| Fichier | Rôle |
|---|---|
| `forgot-password.html` | La page (e-mail + code + nouveau mot de passe) |
| `reset-password.html` | Page de secours ouverte par le lien de l'e-mail |
| `src/lib/accounts.js` | `requestPasswordReset`, `resetPasswordWithCode`, `confirmPasswordReset`, `friendlyAuthError` |
| `login.html` | Le lien « Mot de passe oublié ? » mène à `/forgot-password.html` |
