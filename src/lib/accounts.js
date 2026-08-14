// Comptes locaux (automobilistes + stations) — en attendant un vrai backend (Firebase).
// Persistés dans localStorage. Mots de passe stockés en clair : acceptable uniquement
// pour cette phase de développement local, à remplacer par une vraie authentification
// (hash, backend) au moment du branchement Firebase.
//
// Module sans dépendance React : importable aussi bien depuis login.html (script type="module")
// que depuis les hooks React, pour éviter toute divergence entre les deux.

const CLIENTS_KEY = 'clientAccounts';
const STATIONS_KEY = 'saasStations';

function readList(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function writeList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}

// ─── Comptes automobilistes ────────────────────────────────────────────────
export function getClientAccounts() { return readList(CLIENTS_KEY); }
export function saveClientAccounts(list) { writeList(CLIENTS_KEY, list); }

export function findClientAccount(identifier) {
  const norm = (identifier || '').trim().toLowerCase();
  if (!norm) return null;
  return getClientAccounts().find(
    (c) => c.email?.toLowerCase() === norm || (c.phone && c.phone === identifier.trim())
  ) || null;
}

export function createClientAccount({ firstName, lastName, email, phone, password }) {
  if (findClientAccount(email)) {
    throw new Error('Un compte existe déjà avec cet email.');
  }
  const accounts = getClientAccounts();
  const id = accounts.length > 0 ? Math.max(...accounts.map((a) => a.id)) + 1 : 1;
  const account = {
    id,
    name: `${firstName} ${lastName}`.trim(),
    email,
    phone: phone || '',
    password,
    vehicles: [],
    favoriteStationIds: [],
    createdAt: new Date().toISOString(),
  };
  saveClientAccounts([...accounts, account]);
  return account;
}

export function verifyClientLogin(identifier, password) {
  const account = findClientAccount(identifier);
  return account && account.password === password ? account : null;
}

export function updateClientAccount(id, patch) {
  const accounts = getClientAccounts();
  const next = accounts.map((a) => (a.id === id ? { ...a, ...patch } : a));
  saveClientAccounts(next);
  return next.find((a) => a.id === id) || null;
}

// ─── Comptes stations (registre partagé avec le Super Admin) ──────────────
export function getStationAccounts() { return readList(STATIONS_KEY); }
export function saveStationAccounts(list) { writeList(STATIONS_KEY, list); }

export function findStationByEmail(email) {
  const norm = (email || '').trim().toLowerCase();
  if (!norm) return null;
  return getStationAccounts().find((s) => s.loginEmail?.toLowerCase() === norm) || null;
}

export function createStationAccount({ name, address, city, quartier, region, ownerFirstName, ownerLastName, loginEmail, phone, password, lat, lng }) {
  if (findStationByEmail(loginEmail)) {
    throw new Error('Un compte station existe déjà avec cet email.');
  }
  const stations = getStationAccounts();
  const id = stations.length > 0 ? Math.max(...stations.map((s) => s.id)) + 1 : 1;
  const station = {
    id,
    name,
    ownerName: `${ownerFirstName} ${ownerLastName}`.trim(),
    ownerEmail: loginEmail,
    ownerPhone: phone || '',
    address: address || '',
    city: city || '',
    quartier: quartier || '',
    region: region || '',
    lat: typeof lat === 'number' ? lat : null,
    lng: typeof lng === 'number' ? lng : null,
    status: 'en_attente',
    plan: 'Starter',
    subscriptionStatus: 'essai',
    nextBillingDate: null,
    clientsCount: 0,
    joinedAt: new Date().toISOString(),
    notes: '',
    loginEmail,
    password,
  };
  saveStationAccounts([station, ...stations]);

  // Pré-remplit le profil opérationnel (useAppState) de cette station avec les
  // infos déjà saisies à l'inscription, pour ne pas retomber sur "Configurer".
  localStorage.setItem(`stationProfile_${id}`, JSON.stringify({
    name, phone: phone || '', address: address || '', quartier: quartier || '', region: region || '', openTime: '08:00', closeTime: '20:00',
  }));

  return station;
}

export function verifyStationLogin(email, password) {
  const station = findStationByEmail(email);
  return station && station.password === password ? station : null;
}

// ─── Session ────────────────────────────────────────────────────────────
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

export function getCurrentStationId() {
  return sessionStorage.getItem('currentStationId') || localStorage.getItem('currentStationId') || 'default';
}

export function getCurrentClientId() {
  const raw = sessionStorage.getItem('currentClientId') || localStorage.getItem('currentClientId');
  return raw ? Number(raw) : null;
}
