// Pompistes — stations d'essence qui font aussi du lavage (forfait Business).
// Voir add_pompistes.sql et src/pages/Admin/Pompistes.jsx.
//
// Un pompiste est une fiche `employees` de rôle 'Pompiste' ; son pointage et
// son relevé de fin de journée (pompe, litres vendus, montant encaissé) sont
// portés par la ligne attendance_records du (pompiste, jour).

export const POMPISTE_ROLE = 'Pompiste';

// La station a-t-elle droit à Pompistes ? Forfaits Pro et Business — c'est le forfait de la
// station qui décide, y compris pour une station d'un groupe Sur mesure (elle a son propre
// forfait). Le filtre est l'interface (forfait + permission), comme la comptabilité.
export function stationHasPompistes(billing) {
  return billing?.plan === 'Pro' || billing?.plan === 'Business';
}

// Bornes des colonnes SQL (numeric(10,2) et integer) : mieux vaut refuser une
// coquille (un zéro de trop) ici que recevoir une erreur de la base.
export const MAX_LITERS = 99999999;
export const MAX_AMOUNT = 2000000000;

// Saisie libre -> valeur. '' -> null (« pas encore saisi »), invalide -> undefined.
// Accepte la virgule décimale ("45,5") et les espaces de milliers ("150 000").
export function parseLiters(input) {
  const raw = String(input ?? '').replace(/\s/g, '').replace(',', '.');
  if (raw === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) return undefined;
  const n = Number(raw);
  return n <= MAX_LITERS ? n : undefined;
}
export function parseAmount(input) {
  const raw = String(input ?? '').replace(/[\s ]/g, '');
  if (raw === '') return null;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n <= MAX_AMOUNT ? n : undefined;
}

// Valeur -> texte d'un champ de saisie.
export function toInputValue(n) {
  return n == null ? '' : String(n).replace('.', ',');
}

export const fmtLiters = (n) => `${Number(n || 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} L`;
export const fmtFcfa = (n) => `${Number(n || 0).toLocaleString('fr-FR')} FCFA`;

// Prix moyen au litre déduit du relevé (montant / litres) — sert de contrôle de
// cohérence à l'écran : 8 500 au lieu de 850 saute aux yeux.
export function pricePerLiter(liters, amount) {
  const l = Number(liters);
  if (!(l > 0) || amount == null) return null;
  return Math.round(Number(amount) / l);
}

// Totaux d'une liste de relevés [{ pump, liters, amount }] : global + par pompe
// (libellés comparés sans casse/espaces : « pompe b » et « Pompe B » = même pompe).
export function summarizeReadings(readings) {
  const totals = { liters: 0, amount: 0, entered: 0 };
  const byPump = new Map();
  readings.forEach(({ pump, liters, amount }) => {
    if (liters == null && amount == null) return;
    const l = Number(liters) || 0;
    const a = Number(amount) || 0;
    totals.liters += l;
    totals.amount += a;
    totals.entered += 1;
    const label = (pump || '').trim();
    const key = label.toLowerCase() || '—';
    const cur = byPump.get(key) || { label: label || 'Sans pompe', liters: 0, amount: 0 };
    cur.liters += l;
    cur.amount += a;
    byPump.set(key, cur);
  });
  return {
    ...totals,
    liters: Math.round(totals.liters * 100) / 100,
    byPump: [...byPump.values()]
      .map((p) => ({ ...p, liters: Math.round(p.liters * 100) / 100 }))
      .sort((x, y) => y.amount - x.amount),
  };
}
