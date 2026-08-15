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

  return { id: data.user.id, name: fullName, email, phone: phone || '' };
}

export async function createStationAccount({ name, address, city, quartier, region, ownerFirstName, ownerLastName, loginEmail, phone, password, lat, lng }) {
  const ownerName = `${ownerFirstName} ${ownerLastName}`.trim();
  const { data, error } = await supabase.auth.signUp({ email: loginEmail, password });
  if (error) throw new Error(error.message === 'User already registered' ? 'Un compte station existe déjà avec cet email.' : error.message);
  if (!data.user) throw new Error('Compte créé mais session indisponible — vérifiez les paramètres Auth du projet (confirmation email désactivée ?).');
  await ensureSession(data, loginEmail, password);

  const { data: station, error: stationError } = await supabase.from('stations').insert({
    created_by: data.user.id,
    name, owner_name: ownerName, owner_email: loginEmail, owner_phone: phone || '',
    address: address || '', city: city || '', quartier: quartier || '', region: region || '',
    lat: typeof lat === 'number' ? lat : null, lng: typeof lng === 'number' ? lng : null,
    // Visible immédiatement dans l'annuaire public — pas de validation manuelle
    // préalable par le Super Admin (qui est aussi le seul développeur pour
    // l'instant, ça créait une friction inutile en phase de lancement).
    // Le Super Admin garde "Suspendre" pour retirer une station a posteriori.
    status: 'active',
  }).select().single();
  if (stationError) throw new Error(stationError.message);

  const { error: profileError } = await supabase.from('profiles').insert({
    id: data.user.id, role: 'admin', station_id: station.id, full_name: ownerName, email: loginEmail, phone: phone || '',
  });
  if (profileError) throw new Error(profileError.message);

  return { id: station.id, name: station.name, ownerEmail: loginEmail };
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

// ─── Mot de passe oublié (vrai flux email — remplace l'ancien reset direct
// par identifiant, incompatible avec une authentification sécurisée) ─────
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password.html`,
  });
  if (error) throw new Error(error.message);
}

// Appelé depuis reset-password.html, une fois la session de récupération
// établie automatiquement par le lien reçu par email.
export async function confirmPasswordReset(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
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

// ─── Session (cache léger du rôle/ids courants pour un accès synchrone
// dans le reste de l'app — la vraie session d'auth est gérée par Supabase
// lui-même dans son propre stockage, indépendamment de ces clés) ─────────
export function setSession({ role, remember, clientId, stationId }) {
  const storage = remember ? localStorage : sessionStorage;
  const other = remember ? sessionStorage : localStorage;
  ['isLoggedIn', 'userRole', 'currentClientId', 'currentStationId'].forEach((k) => other.removeItem(k));
  storage.setItem('isLoggedIn', 'true');
  storage.setItem('userRole', role);
  if (clientId != null) storage.setItem('currentClientId', String(clientId));
  if (stationId != null) storage.setItem('currentStationId', String(stationId));
}

export function clearSession() {
  ['isLoggedIn', 'userRole', 'currentClientId', 'currentStationId', 'impersonatingStation'].forEach((k) => {
    localStorage.removeItem(k);
    sessionStorage.removeItem(k);
  });
}

export function getCurrentRole() {
  return sessionStorage.getItem('userRole') || localStorage.getItem('userRole') || null;
}

export function getCurrentStationId() {
  return sessionStorage.getItem('currentStationId') || localStorage.getItem('currentStationId') || 'default';
}

// UUID Supabase — ne plus le forcer en Number() (voir anciens usages).
export function getCurrentClientId() {
  return sessionStorage.getItem('currentClientId') || localStorage.getItem('currentClientId') || null;
}
