// Authentification réelle via Supabase Auth (remplace l'ancien système
// localStorage à mots de passe en clair). `role` d'un compte = celui de sa
// ligne `profiles` ('super_admin' | 'admin' | 'automobiliste'), jamais choisi
// côté client — voir supabase/schema.sql pour les policies RLS associées.
//
// Module sans dépendance React : importable aussi bien depuis login.html
// (script type="module") que depuis les hooks React.
import { supabase } from './supabaseClient';

// signUp() ne renvoie pas toujours une session active immédiatement (selon
// la configuration exacte du projet, même avec "Confirm email" désactivé) —
// sans ça, l'écriture qui suit (profil/station) est rejetée par les policies
// RLS car auth.uid() est vide. On force une connexion explicite pour garantir
// une session avant d'écrire quoi que ce soit.
async function ensureSession(data, email, password) {
  if (data.session) return;
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Compte créé mais connexion automatique impossible : " + error.message);
}

// Déclenche l'Edge Function send-welcome-email en tâche de fond — jamais
// bloquant : un souci d'envoi (clé Resend absente, domaine non vérifié...)
// ne doit jamais empêcher la création du compte. Voir supabase/functions/
// send-welcome-email et add_retention_emails.sql.
function triggerWelcomeEmail(profileId) {
  supabase.functions.invoke('send-welcome-email', { body: { profileId } }).catch(() => {});
}

// ─── Inscription ────────────────────────────────────────────────────────
export async function createClientAccount({ firstName, lastName, email, phone, password }) {
  const fullName = `${firstName} ${lastName}`.trim();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message === 'User already registered' ? 'Un compte existe déjà avec cet email.' : error.message);
  if (!data.user) throw new Error('Compte créé mais session indisponible — vérifiez les paramètres Auth du projet (confirmation email désactivée ?).');
  await ensureSession(data, email, password);

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id, role: 'automobiliste', full_name: fullName, email, phone: phone || '',
  });
  if (profileError) throw new Error(profileError.message);

  triggerWelcomeEmail(data.user.id);
  return { id: data.user.id, name: fullName, email, phone: phone || '' };
}

export async function createStationAccount({ name, address, city, quartier, region, country, ownerFirstName, ownerLastName, loginEmail, phone, plan, password, lat, lng }) {
  const ownerName = `${ownerFirstName} ${ownerLastName}`.trim();
  const { data, error } = await supabase.auth.signUp({ email: loginEmail, password });
  if (error) throw new Error(error.message === 'User already registered' ? 'Un compte station existe déjà avec cet email.' : error.message);
  if (!data.user) throw new Error('Compte créé mais session indisponible — vérifiez les paramètres Auth du projet (confirmation email désactivée ?).');
  await ensureSession(data, loginEmail, password);

  const { data: station, error: stationError } = await supabase.from('stations').insert({
    created_by: data.user.id,
    name, owner_name: ownerName, owner_email: loginEmail, owner_phone: phone || '',
    address: address || '', city: city || '', quartier: quartier || '', region: region || '', country: country || 'SN',
    lat: typeof lat === 'number' ? lat : null, lng: typeof lng === 'number' ? lng : null,
    // Visible immédiatement dans l'annuaire public — pas de validation manuelle
    // préalable par le Super Admin (qui est aussi le seul développeur pour
    // l'instant, ça créait une friction inutile en phase de lancement).
    // Le Super Admin garde "Suspendre" pour retirer une station a posteriori.
    status: 'active',
  }).select().single();
  if (stationError) throw new Error(stationError.message);

  // handle_new_station() crée la ligne station_billing avec plan='Starter' par
  // défaut (voir supabase/schema.sql) — on applique ensuite l'offre réellement
  // choisie sur la page de tarifs/le formulaire d'inscription (essai gratuit
  // de 15 jours inchangé, voir change_trial_to_15_days.sql).
  if (plan) {
    await supabase.from('station_billing').update({ plan }).eq('station_id', station.id);
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id, role: 'admin', station_id: station.id, full_name: ownerName, email: loginEmail, phone: phone || '',
  });
  if (profileError) throw new Error(profileError.message);

  triggerWelcomeEmail(data.user.id);
  return { id: station.id, name: station.name, ownerEmail: loginEmail };
}

// Transforme un compte automobiliste déjà connecté en compte station (voir
// Paramètres > "Devenir une station" et add_client_to_station_conversion.sql
// pour le pourquoi du RPC plutôt que 2 écritures côté client). Ne déconnecte
// pas : la session Supabase Auth reste la même, seul profiles.role change —
// à l'appelant de mettre à jour la session locale (setSession) et de
// rediriger vers /admin/queue.
export async function convertClientToStation({ name, address, quartier, region, country, phone, plan, lat, lng }) {
  const { data, error } = await supabase.rpc('convert_account_to_station', {
    p_name: name,
    p_address: address || '',
    p_quartier: quartier || '',
    p_region: region || '',
    p_country: country || 'SN',
    p_phone: phone || '',
    p_lat: typeof lat === 'number' ? lat : null,
    p_lng: typeof lng === 'number' ? lng : null,
    p_plan: plan || null,
  });
  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name };
}

// Offre « Sur mesure » : un automobiliste devient chef d'entreprise (groupe de
// stations) — voir add_sur_mesure_groups.sql. Même principe que
// convertClientToStation : un RPC atomique plutôt que des écritures côté client
// (profiles.role / is_group_owner sont verrouillés contre l'API).
export async function convertClientToGroup(name) {
  const { data, error } = await supabase.rpc('convert_account_to_group', { p_name: name });
  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name };
}

// Inscription complète d'un chef d'entreprise : compte automobiliste puis
// conversion en groupe. Si la conversion échoue, le compte existe déjà en tant
// qu'automobiliste (on le dit à l'utilisateur pour qu'il se connecte et réessaye).
export async function createGroupOwnerAccount({ firstName, lastName, email, phone, password, orgName }) {
  const client = await createClientAccount({ firstName, lastName, email, phone, password });
  try {
    await convertClientToGroup(orgName);
  } catch (err) {
    throw new Error("Votre compte est créé, mais le groupe n'a pas pu être ouvert (" + err.message + "). Connectez-vous puis contactez le support.");
  }
  return client;
}

// ─── Connexion ──────────────────────────────────────────────────────────
// Le rôle vient de la base (profiles.role), pas de l'onglet cliqué dans
// l'UI de login.html — ça évite de devoir dupliquer la logique de rôle
// côté client et ça marche même si l'utilisateur clique le mauvais onglet.
export async function signIn(identifier, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email: identifier, password });
  if (error) {
    if (error.message === 'Email not confirmed') {
      throw new Error("Ce compte n'est pas confirmé — dans Supabase, Authentication > Users, confirmez-le manuellement ou recréez-le avec « Auto Confirm User » coché.");
    }
    throw new Error('Email ou mot de passe incorrect.');
  }

  const { data: profile, error: profileError } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();
  if (profileError || !profile) {
    await supabase.auth.signOut();
    throw new Error("Compte introuvable — contactez le support.");
  }
  return { user: data.user, profile };
}

export async function signOutUser() {
  await supabase.auth.signOut();
  clearSession();
}

// ─── Mot de passe oublié ─────────────────────────────────────────────────
// Même principe que GestionImmo : l'e-mail contient un CODE que l'utilisateur
// saisit avec son nouveau mot de passe (forgot-password.html, deux blocs sur une
// seule page). Le lien de l'e-mail reste valable en secours (reset-password.html).
// Les deux passent par le modèle d'e-mail « Reset Password » de Supabase, qui doit
// contenir {{ .Token }} — voir docs/Mot-de-passe-oublie.md.

// Erreurs Supabase Auth (en anglais) -> messages clairs en français. `seconds`
// (attente avant de pouvoir redemander un code) est exposé pour le compte à rebours.
export function friendlyAuthError(error) {
  const code = String(error?.code || error?.error_code || '');
  const msg = String(error?.message || error?.msg || '');
  const wait = /after (\d+) seconds?/i.exec(msg);
  if (code === 'over_email_send_rate_limit' || wait || /rate limit/i.test(msg)) {
    return wait
      ? `Pour votre sécurité, patientez ${wait[1]} secondes avant de redemander un code.`
      : "Trop de demandes d'e-mail pour le moment. Réessayez dans quelques minutes.";
  }
  if (code === 'otp_expired' || /expired or is invalid|invalid.{0,20}token|token.{0,20}invalid/i.test(msg)) {
    return 'Code invalide ou expiré. Vérifiez-le, ou demandez un nouveau code.';
  }
  if (code === 'same_password' || /different from the old/i.test(msg)) {
    return "Le nouveau mot de passe doit être différent de l'ancien.";
  }
  if (code === 'weak_password' || /at least \d+ characters|weak/i.test(msg)) {
    return 'Mot de passe trop faible : choisissez-en un plus long et plus varié (8 caractères minimum).';
  }
  if (code === 'validation_failed' || /invalid format|unable to validate email/i.test(msg)) {
    return 'Adresse e-mail invalide.';
  }
  if (/failed to fetch|network|load failed/i.test(msg)) {
    return 'Connexion impossible. Vérifiez votre réseau et réessayez.';
  }
  return 'Une erreur est survenue. Réessayez dans un instant.';
}

// Nombre de secondes d'attente annoncé par Supabase (« … after 45 seconds »), sinon 60.
export function resetCooldownSeconds(error) {
  const wait = /after (\d+) seconds?/i.exec(String(error?.message || error?.msg || ''));
  return wait ? Number(wait[1]) : 60;
}

// Envoie l'e-mail de récupération (code + lien de secours). Supabase répond « ok »
// même si l'adresse n'a pas de compte : on ne révèle jamais si un compte existe.
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });
  if (error) {
    const err = new Error(friendlyAuthError(error));
    err.cooldownSeconds = resetCooldownSeconds(error);
    throw err;
  }
}

// Vérifie le code reçu par e-mail, change le mot de passe, puis ferme la session
// temporaire de récupération : l'utilisateur doit se reconnecter avec le nouveau.
export async function resetPasswordWithCode(email, code, newPassword) {
  const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
  if (verifyError) throw new Error(friendlyAuthError(verifyError));
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    await supabase.auth.signOut();
    throw new Error(friendlyAuthError(updateError));
  }
  await signOutUser();
}

// Appelé depuis reset-password.html (lien de secours), une fois la session de
// récupération établie automatiquement par le lien reçu par email.
export async function confirmPasswordReset(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendlyAuthError(error));
  await signOutUser();
}

// Changement de mot de passe depuis un espace déjà connecté (Paramètres) —
// revérifie le mot de passe actuel par une tentative de connexion, puisque
// Supabase ne l'expose jamais côté client.
export async function changePassword(email, currentPassword, newPassword) {
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
  if (verifyError) throw new Error('Mot de passe actuel incorrect.');
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

// ─── Compteur de connexions par compte ───────────────────────────────────
// Sert à borner l'affichage de l'onboarding (voir [[design_onboarding_backlog]]) :
// 1re/2e/3e connexion -> montré, à partir de la 4e -> masqué définitivement,
// même si l'utilisateur n'a toujours pas fait l'action clé (pas de visite
// guidée perpétuelle). Incrémenté une seule fois par connexion réelle, ici
// dans setSession (appelée par login ET par le auto-login qui suit un
// signup — donc le signup compte bien comme la 1re connexion).
const LOGIN_COUNT_KEY = 'ccg_login_count';
function loginCountKey(role, id) { return `${LOGIN_COUNT_KEY}_${role}_${id}`; }

export function getLoginCount(role, id) {
  if (!role || !id) return 0;
  return parseInt(localStorage.getItem(loginCountKey(role, id)) || '0', 10);
}

function incrementLoginCount(role, id) {
  if (!role || !id) return;
  localStorage.setItem(loginCountKey(role, id), String(getLoginCount(role, id) + 1));
}

// ─── Session (cache léger du rôle/ids courants pour un accès synchrone
// dans le reste de l'app — la vraie session d'auth est gérée par Supabase
// lui-même dans son propre stockage, indépendamment de ces clés) ─────────
export function setSession({ role, remember, clientId, stationId, groupOwner }) {
  const storage = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  ['isLoggedIn', 'userRole', 'currentClientId', 'currentStationId', 'isGroupOwner'].forEach((k) => other.removeItem(k));
  storage.setItem('isLoggedIn', 'true');
  storage.setItem('userRole', role);
  // Chef d'entreprise (offre Sur mesure) : role 'admin' + drapeau, voir add_sur_mesure_groups.sql.
  if (groupOwner) storage.setItem('isGroupOwner', 'true'); else storage.removeItem('isGroupOwner');
  if (clientId != null) storage.setItem('currentClientId', String(clientId));
  if (stationId != null) storage.setItem('currentStationId', String(stationId));
  incrementLoginCount(role, role === 'automobiliste' ? clientId : role === 'admin' ? stationId : null);
  // Point de départ du minuteur d'inactivité (voir lib/idleTimeout.js) : une
  // nouvelle session commence maintenant, on écrase tout horodatage résiduel.
  try {
    localStorage.setItem('ccg_last_activity', String(Date.now()));
    localStorage.removeItem('ccg_session_expired');
  } catch { /* stockage indisponible : la veille retombe sur son suivi en mémoire */ }
}

export function clearSession() {
  ['isLoggedIn', 'userRole', 'currentClientId', 'currentStationId', 'isGroupOwner',
   'ccg_last_activity', 'ccg_session_expired'].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

export function getCurrentRole() {
  return sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || null;
}

// Vrai pour le chef d'entreprise d'un groupe Sur mesure (il navigue entre /groupe et /admin).
export function getIsGroupOwner() {
  return (sessionStorage.getItem('isGroupOwner') || localStorage.getItem('isGroupOwner')) === 'true';
}

// Le patron « entre » dans une station (ou en sort) : on aligne le cache local
// avec profiles.station_id, que les RPC open/close_group_station viennent de changer.
export function setActiveStationId(stationId) {
  const storage = localStorage.getItem('isLoggedIn') ? localStorage : sessionStorage;
  if (stationId) storage.setItem('currentStationId', String(stationId));
  else { localStorage.removeItem('currentStationId'); sessionStorage.removeItem('currentStationId'); }
}

export function getCurrentStationId() {
  return sessionStorage.getItem('currentStationId') || localStorage.getItem('currentStationId') || 'default';
}

// UUID Supabase — ne plus le forcer en Number() (voir anciens usages).
export function getCurrentClientId() {
  return sessionStorage.getItem('currentClientId') || localStorage.getItem('currentClientId') || null;
}
