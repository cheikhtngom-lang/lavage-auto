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

// ─── Pistolets (voir add_pump_nozzles.sql) ─────────────────────────────────
// Une pompe porte des pistolets « Essence 1 », « Gasoil 1 », « Essence 2 »… numérotés à
// l'échelle de la station ; le gérant coche ceux de chaque pompe. Chaque jour, un pompiste
// est posté sur une pompe avec les pistolets qu'il tient, et son relevé se fait par pistolet.
export const FUELS = [
  { key: 'essence', label: 'Essence' },
  { key: 'gasoil', label: 'Gasoil' },
];
export const FUEL_LABEL = { essence: 'Essence', gasoil: 'Gasoil' };
export const MAX_NOZZLE_NUMBER = 20;

export const nozzleKey = (fuel, number) => `${fuel}:${number}`;
export const nozzleLabel = (fuel, number) => `${FUEL_LABEL[fuel] || fuel} ${number}`;

// Essence 1, Gasoil 1, Essence 2, Gasoil 2… (par numéro, puis essence avant gasoil).
export function sortNozzles(list) {
  return [...list].sort((a, b) => a.number - b.number || (a.fuel === b.fuel ? 0 : a.fuel === 'essence' ? -1 : 1));
}

// Première paire Essence n + Gasoil n dont les deux numéros sont libres : proposée
// (pré-cochée) à la création d'une pompe — le cas le plus courant.
export function firstFreePair(takenKeys) {
  for (let n = 1; n <= MAX_NOZZLE_NUMBER; n++) {
    if (!takenKeys.has(nozzleKey('essence', n)) && !takenKeys.has(nozzleKey('gasoil', n))) return n;
  }
  return null;
}

// Litres/montant de lignes de relevé [{ label, fuel, liters, amount }] -> total.
export function sumLines(lines) {
  let liters = 0;
  let amount = 0;
  let hasLiters = false;
  let hasAmount = false;
  (lines || []).forEach((l) => {
    if (l.liters != null) { liters += Number(l.liters) || 0; hasLiters = true; }
    if (l.amount != null) { amount += Number(l.amount) || 0; hasAmount = true; }
  });
  return { liters: hasLiters ? Math.round(liters * 100) / 100 : null, amount: hasAmount ? amount : null };
}

// jsonb lu en base -> lignes propres (une valeur inattendue ne doit jamais faire planter l'écran).
export function normalizeLines(raw) {
  if (!Array.isArray(raw)) return null;
  const lines = raw
    .filter((l) => l && typeof l === 'object' && typeof l.label === 'string' && (l.fuel === 'essence' || l.fuel === 'gasoil'))
    .map((l) => ({
      label: l.label,
      fuel: l.fuel,
      liters: l.liters == null || Number.isNaN(Number(l.liters)) ? null : Number(l.liters),
      amount: l.amount == null || Number.isNaN(Number(l.amount)) ? null : Number(l.amount),
    }));
  return lines.length ? lines : null;
}

// Carburant et numéro d'un libellé « Essence 3 » (pour trier et regrouper d'anciens libellés figés).
export function parseNozzleLabel(label) {
  const m = /^(essence|gasoil)\s+(\d+)$/i.exec(String(label || '').trim());
  return m ? { fuel: m[1].toLowerCase(), number: Number(m[2]) } : null;
}

// Relevés [{ lines }] -> total par carburant et par pistolet. Seules les lignes détaillées
// comptent ici : un relevé saisi en total seul (station sans pistolets, ancien relevé) est
// isolé dans `undetailed`, pour ne pas fausser la ventilation.
export function summarizeLines(readings) {
  const byFuel = { essence: { liters: 0, amount: 0 }, gasoil: { liters: 0, amount: 0 } };
  const byNozzle = new Map();
  const undetailed = { liters: 0, amount: 0, count: 0 };
  readings.forEach(({ lines, liters, amount }) => {
    if (!lines || lines.length === 0) {
      if (liters != null || amount != null) {
        undetailed.liters += Number(liters) || 0;
        undetailed.amount += Number(amount) || 0;
        undetailed.count += 1;
      }
      return;
    }
    lines.forEach((l) => {
      const lit = Number(l.liters) || 0;
      const amt = Number(l.amount) || 0;
      byFuel[l.fuel].liters += lit;
      byFuel[l.fuel].amount += amt;
      const cur = byNozzle.get(l.label) || { label: l.label, fuel: l.fuel, number: parseNozzleLabel(l.label)?.number ?? 0, liters: 0, amount: 0 };
      cur.liters += lit;
      cur.amount += amt;
      byNozzle.set(l.label, cur);
    });
  });
  const r2 = (n) => Math.round(n * 100) / 100;
  return {
    byFuel: {
      essence: { liters: r2(byFuel.essence.liters), amount: byFuel.essence.amount },
      gasoil: { liters: r2(byFuel.gasoil.liters), amount: byFuel.gasoil.amount },
    },
    byNozzle: sortNozzles([...byNozzle.values()]).map((n) => ({ ...n, liters: r2(n.liters) })),
    undetailed: { ...undetailed, liters: r2(undetailed.liters) },
    hasDetail: byNozzle.size > 0,
  };
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
