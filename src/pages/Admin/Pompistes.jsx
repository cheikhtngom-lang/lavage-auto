import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import WorkedTimeCell from '../../components/ui/WorkedTimeCell';
import {
  CheckCircle2, Clock, XCircle, Fuel, Calendar, Loader2, FileSpreadsheet, Save, Settings2, Pencil, X, ClipboardEdit,
} from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { isPastClosingTime } from '../../lib/stationData';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { formatMinutesToHM, formatWorkedTime, parseDurationToMinutes, todayKey, resolvePointageStatus, rosterDailyStatus } from '../../lib/attendance';
import NozzleChip from '../../components/pompistes/NozzleChip';
import {
  POMPISTE_ROLE, MAX_LITERS, MAX_AMOUNT, FUEL_LABEL, parseLiters, parseAmount, toInputValue, fmtLiters, fmtFcfa, pricePerLiter, summarizeReadings,
  summarizeLines, sumLines, parseNozzleLabel, sortNozzles,
} from '../../lib/pompistes';

const inputCls = 'bg-neutral-900 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors';

const STATUS_ICON = {
  'Actif': <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
  'En pause': <Clock className="w-4 h-4 text-amber-400" />,
  'Absent': <XCircle className="w-4 h-4 text-red-400" />,
  'Terminé': <CheckCircle2 className="w-4 h-4 text-blue-400" />,
  'Fin de service': <CheckCircle2 className="w-4 h-4 text-neutral-400" />,
};
const STATUS_COLOR = {
  'Actif': 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  'En pause': 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  'Absent': 'bg-red-500/20 text-red-400 border-red-500/30',
  'Terminé': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Fin de service': 'bg-neutral-500/20 text-neutral-400 border-neutral-500/30',
};
const DAILY_COLOR = {
  present: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  repos: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  conge: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  maladie: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  absent: 'bg-red-500/10 text-red-400 border-red-500/30',
};
const STATUS_LABEL = { present: 'Présent', repos: 'Repos', conge: 'Congé', maladie: 'Maladie', absent: 'Absent' };

// Lignes du relevé dans l'ordre Essence 1, Gasoil 1, Essence 2… (libellés inconnus à la fin).
const rowRank = (l) => { const p = parseNozzleLabel(l.label); return p ? [p.number, p.fuel === 'essence' ? 0 : 1] : [999, 0]; };
const sortRows = (rows) => [...rows].sort((a, b) => { const [an, af] = rowRank(a); const [bn, bf] = rowRank(b); return an - bn || af - bf; });

// ─── Fenêtre « relevé » : litres vendus + argent encaissé ───────────────────
// S'ouvre dès qu'on clique sur « Descente » (et sur « Saisir / Modifier le relevé »).
// « Plus tard » la ferme sans rien enregistrer : la ligne reste marquée « À saisir ».
//
// Pompe avec pistolets (Essence 1, Gasoil 4…) : une ligne litres + montant PAR pistolet tenu
// ce jour-là, le total est la somme. Pompe sans pistolets : un seul total, comme avant.
function ReadingModal({ row, dateLabel, pumpOptions, nozzlesOfPump, initial, onSave, onClose }) {
  const [pump, setPump] = useState(initial.pump);
  const [liters, setLiters] = useState(initial.liters);
  const [amount, setAmount] = useState(initial.amount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const rowOf =(label, fuel, prev) => ({ label, fuel, liters: prev?.liters ?? '', amount: prev?.amount ?? '' });

  // Lignes de départ : les pistolets cochés pour ce jour (à défaut, tous ceux de la pompe), plus
  // tout pistolet déjà relevé qui n'existe plus (décoché, renommé depuis) — rien ne se perd.
  const [lines, setLines] = useState(() => {
    const opts = nozzlesOfPump(initial.pump);
    const base = initial.assigned.length > 0 ? initial.assigned : opts.map((n) => n.label);
    const known = new Map(initial.lines.map((l) => [l.label, l]));
    const labels = [...base, ...initial.lines.map((l) => l.label).filter((l) => !base.includes(l))];
    return labels.map((label) => {
      const prev = known.get(label);
      const fuel = opts.find((n) => n.label === label)?.fuel || prev?.fuel || parseNozzleLabel(label)?.fuel || 'essence';
      return rowOf(label, fuel, prev && { liters: toInputValue(prev.liters), amount: toInputValue(prev.amount) });
    });
  });

  // Changer de pompe : ses pistolets remplacent la liste ; une ligne déjà saisie est conservée.
  const changePump = (name) => {
    setPump(name);
    const opts = nozzlesOfPump(name);
    setLines((cur) => {
      const filled = cur.filter((l) => l.liters.trim() || l.amount.trim());
      const labels = new Set(opts.map((n) => n.label));
      const next = opts.map((n) => rowOf(n.label, n.fuel, cur.find((l) => l.label === n.label)));
      return [...next, ...filled.filter((l) => !labels.has(l.label))];
    });
  };
  const setLine = (label, patch) => setLines((cur) => cur.map((l) => (l.label === label ? { ...l, ...patch } : l)));
  const removeLine = (label) => setLines((cur) => cur.filter((l) => l.label !== label));
  const addLine = (n) => setLines((cur) => sortRows([...cur, rowOf(n.label, n.fuel)]));

  const pumpNozzles = nozzlesOfPump(pump);
  const addable = pumpNozzles.filter((n) => !lines.some((l) => l.label === n.label));
  const nozzleMode = lines.length > 0 || pumpNozzles.length > 0;

  const parsedLines = lines.map((l) => ({ ...l, pl: parseLiters(l.liters), pa: parseAmount(l.amount) }));
  const parsedLiters = parseLiters(liters);
  const parsedAmount = parseAmount(amount);
  const detailTotal = sumLines(parsedLines.map((l) => ({ liters: l.pl ?? null, amount: l.pa ?? null })));
  const price = nozzleMode ? pricePerLiter(detailTotal.liters, detailTotal.amount) : pricePerLiter(parsedLiters, parsedAmount);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async (e) => {
    e.preventDefault();
    let values;
    if (nozzleMode) {
      const bad = parsedLines.find((l) => l.pl === undefined || l.pa === undefined);
      if (bad) { setError(`${bad.label} : ${bad.pl === undefined ? 'litres invalides (ex : 1250 ou 1250,5)' : 'montant invalide (chiffres uniquement)'}.`); return; }
      const filled = parsedLines.filter((l) => l.pl != null || l.pa != null).map((l) => ({ label: l.label, fuel: l.fuel, liters: l.pl, amount: l.pa }));
      if (filled.length === 0) { setError('Saisissez les litres vendus ou le montant encaissé d\'au moins un pistolet.'); return; }
      const total = sumLines(filled);
      if ((total.liters ?? 0) > MAX_LITERS || (total.amount ?? 0) > MAX_AMOUNT) { setError('Total trop élevé : vérifiez les valeurs saisies.'); return; }
      values = { pumpLabel: pump, liters: total.liters, amountCollected: total.amount, lines: filled, pumpNozzles: lines.map((l) => l.label) };
    } else {
      if (parsedLiters === undefined) { setError('Litres invalides (ex : 1250 ou 1250,5).'); return; }
      if (parsedAmount === undefined) { setError('Montant invalide (chiffres uniquement).'); return; }
      if (parsedLiters == null && parsedAmount == null) { setError('Saisissez au moins les litres vendus ou le montant encaissé.'); return; }
      // Sans pistolets : simple total. On n'efface d'éventuelles lignes/pistolets que s'il y en avait.
      values = {
        pumpLabel: pump, liters: parsedLiters, amountCollected: parsedAmount,
        lines: initial.lines.length > 0 ? null : undefined, pumpNozzles: initial.assigned.length > 0 ? [] : undefined,
      };
    }
    setBusy(true);
    setError('');
    const ok = await onSave(values);
    setBusy(false);
    if (ok) onClose();
    else setError('Enregistrement impossible. Réessayez.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <form
        onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className={`bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full ${nozzleMode ? 'max-w-xl' : 'max-w-md'} shadow-2xl relative max-h-[90vh] overflow-y-auto`}
      >
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
        <h2 className="text-xl font-bold text-white pr-8 flex items-center gap-2"><Fuel className="w-5 h-5 text-blue-400" /> Relevé de {row.name}</h2>
        <p className="text-sm text-neutral-400 mt-1 mb-5">
          <span className="capitalize">{dateLabel}</span>
          {row.live.totalTime ? ` — ${row.live.totalTime} de service` : ''}
        </p>

        <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Pompe</label>
        <select value={pump} onChange={(e) => changePump(e.target.value)} className={`${inputCls} w-full mb-4 appearance-none`}>
          <option value="">— Aucune —</option>
          {pumpOptions.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {nozzleMode ? (
          <>
            <div className="grid grid-cols-[6.5rem_1fr_1fr_1.75rem] gap-x-2 gap-y-2 items-center mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Pistolet</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Litres vendus</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Encaissé (FCFA)</span>
              <span />
              {lines.map((l, i) => (
                <React.Fragment key={l.label}>
                  <NozzleChip label={l.label} fuel={l.fuel} />
                  <input
                    autoFocus={i === 0} type="text" inputMode="decimal" value={l.liters} onChange={(e) => setLine(l.label, { liters: e.target.value })}
                    aria-label={`Litres ${l.label}`} placeholder="0" className={`${inputCls} w-full min-w-0`}
                  />
                  <input
                    type="text" inputMode="numeric" value={l.amount} onChange={(e) => setLine(l.label, { amount: e.target.value })}
                    aria-label={`Montant ${l.label}`} placeholder="0" className={`${inputCls} w-full min-w-0`}
                  />
                  <button type="button" onClick={() => removeLine(l.label)} title="Retirer ce pistolet de la journée" className="p-1 text-neutral-600 hover:text-red-400"><X className="w-4 h-4" /></button>
                </React.Fragment>
              ))}
            </div>
            {lines.length === 0 && <p className="text-sm text-neutral-500 mb-2">Aucun pistolet sur cette journée : ajoutez-en ci-dessous.</p>}
            {addable.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <span className="text-xs text-neutral-500 mr-1">Ajouter :</span>
                {addable.map((n) => (
                  <button key={n.label} type="button" onClick={() => addLine(n)} className="text-xs font-bold text-neutral-400 hover:text-white px-2 py-1 rounded-lg border border-dashed border-white/15 hover:border-white/30 transition-colors">+ {n.label}</button>
                ))}
              </div>
            )}
            <div className="mt-4 rounded-xl bg-neutral-950/60 border border-white/5 px-4 py-3 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-neutral-500">Total du relevé</span>
              <span className="text-sm"><b className="text-white">{fmtLiters(detailTotal.liters)}</b> <span className="text-neutral-600">·</span> <b className="text-emerald-400">{fmtFcfa(detailTotal.amount)}</b></span>
            </div>
            <p className="text-xs text-neutral-500 mt-2 mb-4 h-4">{price != null ? `Soit environ ${price.toLocaleString('fr-FR')} FCFA le litre` : ''}</p>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Litres vendus</label>
            <input
              autoFocus type="text" inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)}
              placeholder="Ex : 1250,5" className={`${inputCls} w-full mb-4 !text-lg !py-3`}
            />

            <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-1">Argent encaissé (FCFA)</label>
            <input
              type="text" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Ex : 1 100 000" className={`${inputCls} w-full mb-2 !text-lg !py-3`}
            />
            <p className="text-xs text-neutral-500 mb-4 h-4">{price != null ? `Soit environ ${price.toLocaleString('fr-FR')} FCFA le litre` : ''}</p>
          </>
        )}

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit" disabled={busy}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Enregistrer le relevé
          </button>
          <button type="button" onClick={onClose} className="px-4 py-3 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors">
            Plus tard
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Pompistes() {
  useDocumentTitle('Pompistes');
  const {
    employees, updateEmployee, resumeEmployee, finishService, attendanceHistory, recordDailyAttendance,
    savePumpReading, assignPump, pumps, loadAttendanceForDate, loadAttendanceForMonth, stationProfile,
  } = useAppState();

  const [selectedDate, setSelectedDate] = useState(todayKey());
  const isToday = selectedDate === todayKey();
  const [readingRowId, setReadingRowId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMonth, setExportMonth] = useState(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
  });

  // Les pompes et relevés du jour se lisent dans attendance_records (comme l'historique
  // des laveurs) : on charge la date affichée, aujourd'hui compris.
  useEffect(() => {
    loadAttendanceForDate(selectedDate);
    setReadingRowId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Pompistes retirés de la liste (status 'Archivé') : leur historique est conservé.
  const roster = (employees || []).filter((e) => e.role === POMPISTE_ROLE && e.status !== 'Archivé');
  const employeeById = (id) => (employees || []).find((e) => e.id === id);
  const activePumps = (pumps || []).filter((p) => p.active);

  // Pompes proposées pour poster un pompiste : les pompes actives + la valeur courante
  // si elle n'en fait plus partie (pompe retirée depuis, ou saisie d'avant).
  const pumpOptionsFor = (current) => {
    const names = activePumps.map((p) => p.name);
    if (current && !names.some((n) => n.toLowerCase() === current.toLowerCase())) names.push(current);
    return names;
  };
  // Pistolets d'une pompe active, désignée par son nom (casse et espaces ignorés).
  const nozzlesOfPump = (name) => {
    const key = (name || '').trim().toLowerCase();
    return key ? (activePumps.find((p) => p.name.trim().toLowerCase() === key)?.nozzles || []) : [];
  };

  // ─── Un pistolet = un seul pompiste EN SERVICE à la fois ─────────────────
  // Tant que celui qui tient « Essence 1 » n'a pas fait sa descente, personne d'autre ne
  // peut le prendre ; dès sa descente, il est libre pour le relais. Le pompiste descendu
  // le garde sur SA ligne du jour (son relevé). Même règle en base : add_nozzle_exclusive.sql.
  const todayEntries = attendanceHistory?.[todayKey()] || {};
  // Pistolets tenus en ce moment par un pompiste en service (sauf `exceptId`) : libellé -> nom.
  const busyNozzles = (exceptId) => {
    const busy = new Map();
    roster.forEach((p) => {
      if (p.id === exceptId || p.dailyStatus !== 'present' || !p.clockInAt || p.clockOutAt) return;
      (todayEntries[p.id]?.pumpNozzles || []).forEach((l) => busy.set(l, p.name));
    });
    return busy;
  };
  // « Essence 1 et Gasoil 1 : tenus par Awa jusqu'à sa descente. »
  const describeTaken = (labels, busy) => {
    const byHolder = new Map();
    labels.forEach((l) => byHolder.set(busy.get(l), [...(byHolder.get(busy.get(l)) || []), l]));
    return [...byHolder].map(([name, ls]) => `${ls.join(', ')} : tenu${ls.length > 1 ? 's' : ''} par ${name} jusqu'à sa descente`).join(' ; ') + '.';
  };
  // Message sous la ligne d'un pompiste (enregistrement refusé par la base…).
  const [notices, setNotices] = useState({});
  const notify = (rowId, msg) => setNotices((n) => ({ ...n, [rowId]: msg || '' }));

  // ─── Pointage (même mécanique que les laveurs) ────────────────────────────
  const changeDailyStatus = (id, newStatus) => {
    updateEmployee(id, { dailyStatus: newStatus });
    recordDailyAttendance(id, { dailyStatus: newStatus });
  };

  // Dès qu'un pompiste est marqué « Présent » aujourd'hui, la prise de poste est
  // enregistrée automatiquement (une seule fois par jour, voir Washers.jsx), et sa
  // pompe habituelle est figée sur la journée — on peut ensuite le poster ailleurs.
  useEffect(() => {
    const toClockIn = roster.filter((p) => p.dailyStatus === 'present' && !p.clockInAt);
    if (toClockIn.length === 0) return;
    const now = new Date();
    const display = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const patch = { status: 'Actif', clockIn: display, clockInAt: now.toISOString(), clockOut: null, clockOutAt: null, totalTime: null };
    const busy = busyNozzles(null);
    toClockIn.forEach((p) => {
      updateEmployee(p.id, patch);
      // Pompe habituelle : tous ses pistolets sont cochés d'office (à décocher si besoin),
      // sauf ceux qu'un autre pompiste en service tient encore.
      const all = nozzlesOfPump(p.pumpLabel).map((n) => n.label);
      // (les pistolets écartés restent affichés verrouillés sur sa ligne, avec leur détenteur)
      const nozzles = all.filter((l) => !busy.has(l));
      nozzles.forEach((l) => busy.set(l, p.name)); // deux pompistes marqués présents ensemble : le premier est servi
      recordDailyAttendance(p.id, {
        ...patch, dailyStatus: 'present',
        ...(p.pumpLabel ? { pumpLabel: p.pumpLabel } : {}),
        ...(nozzles.length > 0 ? { pumpNozzles: nozzles } : {}),
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.map((p) => `${p.id}:${p.dailyStatus}:${p.clockInAt || ''}`).join(',')]);

  // « Descente » : la sortie est enregistrée, puis la fenêtre du relevé s'ouvre.
  const handleClockOut = (id) => {
    const now = new Date();
    const display = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const pompiste = roster.find((p) => p.id === id);
    const patch = { status: 'Terminé', clockOut: display, clockOutAt: now.toISOString(), totalTime: formatWorkedTime(pompiste?.clockInAt, now) };
    updateEmployee(id, patch);
    recordDailyAttendance(id, patch);
    setReadingRowId(id);
  };

  // ─── Lignes du jour affiché ───────────────────────────────────────────────
  // Aujourd'hui : les pompistes présents (état live, comme la page Laveurs).
  // Jour passé : l'instantané enregistré ce jour-là — un relevé saisi pour un
  // pompiste qui n'était pas marqué « Présent » reste visible et corrigeable.
  const dayEntries = attendanceHistory?.[selectedDate] || {};
  const rows = (isToday
    ? roster.filter((p) => p.dailyStatus === 'present').map((p) => ({ id: p.id, name: p.name, live: p, status: resolvePointageStatus(p), saved: dayEntries[p.id] }))
    : Object.values(dayEntries)
        .filter((r) => r.role === POMPISTE_ROLE && (r.dailyStatus === 'present' || r.liters != null || r.amountCollected != null))
        .map((r) => ({ id: r.id, name: r.name || employeeById(r.id)?.name || 'Pompiste', live: r, status: r.status || 'Absent', saved: r }))
  );

  // Pompe du jour : celle choisie pour ce jour, à défaut la pompe habituelle.
  const pumpOf = (row) => (row.saved?.pumpLabel || employeeById(row.id)?.pumpLabel || '').trim();
  const hasReading = (row) => row.saved?.liters != null || row.saved?.amountCollected != null;
  const readingRow = rows.find((r) => r.id === readingRowId) || null;

  const saveReading = async (row, values) => {
    const { success } = await savePumpReading(row.id, selectedDate, values);
    return success;
  };

  // ─── Pistolets tenus ce jour-là ───────────────────────────────────────────
  // Choisir une pompe coche d'office tous ses pistolets (un pompiste tient en général toute la
  // pompe) ; on décoche ceux qu'il ne tient pas — ex : Pompe A avec Essence 1 et Gasoil 4.
  const assignedOf = (row) => row.saved?.pumpNozzles || [];
  // En service = arrivée pointée, pas encore descendu (seul cas où la règle s'applique :
  // corriger la ligne d'un pompiste descendu ou d'un jour passé reste libre).
  const onDuty = (row) => isToday && !!row.live?.clockInAt && !row.live?.clockOutAt;
  const busyFor = (row) => (onDuty(row) ? busyNozzles(row.id) : new Map());
  const saveNozzles = async (row, pump, labels) => {
    const { error } = await assignPump(row.id, selectedDate, pump, labels);
    if (error) notify(row.id, error.message || 'Enregistrement impossible. Réessayez.');
    return !error;
  };
  const choosePump = (row, name) => {
    const labels = nozzlesOfPump(name).map((n) => n.label);
    const busy = busyFor(row);
    const free = labels.filter((l) => !busy.has(l)); // les autres s'affichent verrouillés (🔒)
    notify(row.id, '');
    saveNozzles(row, name, labels.length > 0 ? free : (assignedOf(row).length > 0 ? [] : undefined));
  };
  const toggleNozzle = (row, label) => {
    const cur = assignedOf(row);
    const adding = !cur.includes(label);
    const busy = busyFor(row);
    if (adding && busy.has(label)) { notify(row.id, describeTaken([label], busy)); return; }
    notify(row.id, '');
    const next = adding ? [...cur, label] : cur.filter((l) => l !== label);
    saveNozzles(row, pumpOf(row), sortRows(next.map((l) => ({ label: l }))).map((l) => l.label));
  };
  // « Reprendre service » : si un autre pompiste a pris le relais sur certains de ses pistolets,
  // il reprend sans eux (après confirmation) — sinon la reprise serait refusée.
  const handleResume = async (row) => {
    const busy = busyNozzles(row.id);
    const taken = assignedOf(row).filter((l) => busy.has(l));
    if (taken.length > 0) {
      const which = taken.length > 1 ? 'ces pistolets' : 'ce pistolet';
      if (!window.confirm(`${describeTaken(taken, busy)}\n\nReprendre le service de ${row.name} sans ${which} ?`)) return;
      const ok = await saveNozzles(row, pumpOf(row), assignedOf(row).filter((l) => !busy.has(l)));
      if (!ok) return;
    }
    notify(row.id, '');
    resumeEmployee(row.id);
  };
  // Même pistolet sur deux lignes du jour : relais normal (l'un est descendu avant que l'autre
  // le prenne), ou conflit si les deux sont en service en même temps (données d'avant la règle).
  const sharedOf = (row) => assignedOf(row).map((l) => {
    const others = rows.filter((r) => r.id !== row.id && assignedOf(r).includes(l));
    if (others.length === 0) return null;
    return { label: l, clash: onDuty(row) && others.some(onDuty), names: others.map((r) => r.name).join(', ') };
  }).filter(Boolean);

  // Totaux du jour : uniquement ce qui est ENREGISTRÉ.
  const summary = summarizeReadings(rows.map((r) => ({ pump: pumpOf(r), liters: r.saved?.liters, amount: r.saved?.amountCollected })));
  const detail = summarizeLines(rows.map((r) => ({ lines: r.saved?.pumpLines, liters: r.saved?.liters, amount: r.saved?.amountCollected })));
  const avgPrice = pricePerLiter(summary.liters, summary.amount);
  const pendingCount = rows.filter((r) => !hasReading(r) && (r.status === 'Terminé' || r.status === 'Fin de service' || !isToday)).length;
  const presentCount = roster.filter((p) => p.dailyStatus === 'present').length;
  const selectedDateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  // ─── Export Excel d'un mois ───────────────────────────────────────────────
  // Trois feuilles à partir des vraies données d'attendance_records : « Synthèse »
  // (1 ligne / pompiste : jours, heures, litres, encaissé, prix moyen), « Par
  // pompe » et « Détail par jour ». Un pompiste retiré depuis, mais qui a
  // travaillé ce mois-là, reste inclus.
  const exportToExcel = async () => {
    const [yStr, mStr] = exportMonth.split('-');
    const year = Number(yStr);
    const month = Number(mStr) - 1;
    if (Number.isNaN(year) || Number.isNaN(month)) return;
    const now = new Date();
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    setExporting(true);
    let monthData = {};
    try {
      monthData = await loadAttendanceForMonth(year, month) || {};
    } catch (err) {
      setExporting(false);
      alert("Impossible de charger les données de ce mois.");
      return;
    }
    setExporting(false);

    const people = new Map();
    (employees || []).filter((e) => e.role === POMPISTE_ROLE).forEach((e) => people.set(e.id, { id: e.id, name: e.name, live: e }));
    Object.entries(monthData).forEach(([id, days]) => {
      if (people.has(id)) return;
      const any = Object.values(days).find((r) => r.role === POMPISTE_ROLE);
      if (any) people.set(id, { id, name: any.name || 'Pompiste supprimé', live: null });
    });
    const staff = [...people.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'fr'));

    // Aujourd'hui : le pointage vient de l'état live ; les relevés, de la base.
    const recFor = (p, i) => {
      const saved = monthData[p.id]?.[`${year}-${pad(month + 1)}-${pad(i)}`] || null;
      if (isCurrentMonth && i === now.getDate() && p.live) {
        return { ...(saved || {}), dailyStatus: p.live.dailyStatus, clockInAt: p.live.clockInAt, clockOutAt: p.live.clockOutAt, totalTime: p.live.totalTime };
      }
      return saved;
    };
    const minutesFor = (rec, dayIndex) => {
      if (!rec || rec.dailyStatus !== 'present') return 0;
      if (rec.totalTime) return parseDurationToMinutes(rec.totalTime);
      if (rec.clockInAt && rec.clockOutAt) return Math.max(0, Math.round((new Date(rec.clockOutAt).getTime() - new Date(rec.clockInAt).getTime()) / 60000));
      if (rec.clockInAt) {
        const cap = new Date(year, month, dayIndex, 23, 59, 0, 0);
        return Math.max(0, Math.round((Math.min(now.getTime(), cap.getTime()) - new Date(rec.clockInAt).getTime()) / 60000));
      }
      return 0;
    };
    const hhmm = (t) => (t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '');

    const detailRows = [['Date', 'Jour', 'Pompiste', 'Pompe', 'Pistolets tenus', 'Statut', 'Arrivée', 'Départ', 'Heures', 'Litres vendus', 'Montant encaissé (FCFA)', 'Prix moyen / litre', 'Essence (L)', 'Essence (FCFA)', 'Gasoil (L)', 'Gasoil (FCFA)']];
    const synthRows = [['Pompiste', 'Jours travaillés', 'Total heures', 'Total (h décimal)', 'Litres vendus', 'Montant encaissé (FCFA)', 'Prix moyen / litre']];
    const allReadings = [];
    const allDetail = [];
    let grandMin = 0, grandDays = 0, grandLiters = 0, grandAmount = 0;

    staff.forEach((p) => {
      let tMin = 0, days = 0, liters = 0, amount = 0;
      for (let i = 1; i <= daysInMonth; i++) {
        const rec = recFor(p, i);
        if (!rec) continue;
        const withReading = rec.liters != null || rec.amountCollected != null;
        if (rec.dailyStatus !== 'present' && !withReading) continue;
        const min = minutesFor(rec, i);
        if (rec.dailyStatus === 'present') { tMin += min; days += 1; }
        liters += Number(rec.liters) || 0;
        amount += Number(rec.amountCollected) || 0;
        allReadings.push({ pump: rec.pumpLabel, liters: rec.liters, amount: rec.amountCollected });
        allDetail.push({ lines: rec.pumpLines, liters: rec.liters, amount: rec.amountCollected });
        const byFuel = rec.pumpLines?.length ? summarizeLines([{ lines: rec.pumpLines }]).byFuel : null;
        const d = new Date(year, month, i);
        detailRows.push([
          `${pad(i)}/${pad(month + 1)}/${year}`, d.toLocaleDateString('fr-FR', { weekday: 'long' }), p.name, rec.pumpLabel || '',
          (rec.pumpNozzles || []).join(', '),
          STATUS_LABEL[rec.dailyStatus] || '', hhmm(rec.clockInAt), hhmm(rec.clockOutAt),
          rec.dailyStatus === 'present' ? formatMinutesToHM(min) : '',
          rec.liters ?? '', rec.amountCollected ?? '', pricePerLiter(rec.liters, rec.amountCollected) ?? '',
          byFuel ? byFuel.essence.liters : '', byFuel ? byFuel.essence.amount : '', byFuel ? byFuel.gasoil.liters : '', byFuel ? byFuel.gasoil.amount : '',
        ]);
      }
      liters = Math.round(liters * 100) / 100;
      grandMin += tMin; grandDays += days; grandLiters += liters; grandAmount += amount;
      synthRows.push([p.name, days, formatMinutesToHM(tMin), Number((tMin / 60).toFixed(2)), liters, amount, pricePerLiter(liters, amount) ?? '']);
    });
    grandLiters = Math.round(grandLiters * 100) / 100;
    synthRows.push([]);
    synthRows.push(['TOTAL', grandDays, formatMinutesToHM(grandMin), Number((grandMin / 60).toFixed(2)), grandLiters, grandAmount, pricePerLiter(grandLiters, grandAmount) ?? '']);

    const pumpRows = [['Pompe', 'Litres vendus', 'Montant encaissé (FCFA)', 'Prix moyen / litre']];
    summarizeReadings(allReadings).byPump.forEach((pp) => pumpRows.push([pp.label, pp.liters, pp.amount, pricePerLiter(pp.liters, pp.amount) ?? '']));

    // « Par pistolet » : Essence 1, Gasoil 1… sur le mois, puis le total par carburant.
    const monthDetail = summarizeLines(allDetail);
    const nozzleRows = [['Pistolet', 'Carburant', 'Litres vendus', 'Montant encaissé (FCFA)', 'Prix moyen / litre']];
    monthDetail.byNozzle.forEach((n) => nozzleRows.push([n.label, FUEL_LABEL[n.fuel], n.liters, n.amount, pricePerLiter(n.liters, n.amount) ?? '']));
    if (monthDetail.hasDetail) {
      nozzleRows.push([]);
      ['essence', 'gasoil'].forEach((f) => {
        const t = monthDetail.byFuel[f];
        nozzleRows.push([`TOTAL ${FUEL_LABEL[f]}`, FUEL_LABEL[f], t.liters, t.amount, pricePerLiter(t.liters, t.amount) ?? '']);
      });
      if (monthDetail.undetailed.count > 0) nozzleRows.push(['Hors ventilation (total seul)', '', monthDetail.undetailed.liters, monthDetail.undetailed.amount, pricePerLiter(monthDetail.undetailed.liters, monthDetail.undetailed.amount) ?? '']);
    }

    const wb = XLSX.utils.book_new();
    wb.Props = { Title: `Pompistes ${exportMonth}`, Subject: 'Pointage et relevés de pompe', Author: stationProfile?.name || 'Clean Car Galsen', CreatedDate: now };
    const wsSynth = XLSX.utils.aoa_to_sheet(synthRows);
    wsSynth['!cols'] = [{ wch: 26 }, { wch: 16 }, { wch: 13 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 17 }];
    XLSX.utils.book_append_sheet(wb, wsSynth, 'Synthèse');
    const wsPump = XLSX.utils.aoa_to_sheet(pumpRows);
    wsPump['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 24 }, { wch: 17 }];
    XLSX.utils.book_append_sheet(wb, wsPump, 'Par pompe');
    if (monthDetail.hasDetail) {
      const wsNozzle = XLSX.utils.aoa_to_sheet(nozzleRows);
      wsNozzle['!cols'] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 24 }, { wch: 17 }];
      XLSX.utils.book_append_sheet(wb, wsNozzle, 'Par pistolet');
    }
    const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
    wsDetail['!cols'] = [{ wch: 12 }, { wch: 11 }, { wch: 26 }, { wch: 16 }, { wch: 30 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 14 }, { wch: 24 }, { wch: 17 }, { wch: 13 }, { wch: 15 }, { wch: 12 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Détail par jour');
    const safeStation = (stationProfile?.name || 'Station').replace(/[^\w\-]+/g, '_');
    XLSX.writeFile(wb, `Pompistes_${exportMonth}_${safeStation}.xlsx`);
  };

  const manageLink = (
    <Link to="/admin/settings" state={{ tab: 'pompistes' }} className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors">
      <Settings2 className="w-3.5 h-3.5" /> Pompistes &amp; pompes
    </Link>
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Gestion des <span className="text-blue-400">Pompistes</span></h1>
          <p className="text-neutral-400 text-lg">Postez vos pompistes sur une pompe chaque jour, pointez-les, puis relevez les litres vendus et l'argent encaissé à la descente.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-5 py-3 flex items-center gap-3">
            <Fuel className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-bold text-blue-400">{presentCount} Présent{presentCount > 1 ? 's' : ''} Aujourd'hui</span>
          </div>
          <input
            type="month"
            value={exportMonth}
            max={todayKey().slice(0, 7)}
            onChange={(e) => setExportMonth(e.target.value)}
            title="Mois à extraire"
            className="bg-neutral-900 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
          />
          <button
            onClick={exportToExcel}
            disabled={exporting}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-wait text-white rounded-xl px-5 py-3 flex items-center gap-2 font-bold transition-all shadow-lg shadow-emerald-500/20"
          >
            {exporting ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5" />}
            <span className="hidden md:inline">{exporting ? 'Extraction…' : 'Extraire le mois (Excel)'}</span>
            <span className="md:hidden">{exporting ? '…' : 'Excel'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ═══ Équipe de pompistes : présence du jour ═══ */}
        <Card className="h-fit">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold text-white">Base de Pompistes</h2>
              {manageLink}
            </div>
            <p className="text-sm text-neutral-400 mb-5">Cochez les pompistes de garde pour la journée d'aujourd'hui.</p>

            {roster.length === 0 ? (
              <div className="text-center py-6">
                <p className="text-sm text-neutral-500 mb-3">Aucun pompiste pour l'instant.</p>
                <p className="text-xs text-neutral-500">Ajoutez vos pompistes et les pompes de la station dans Paramètres.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {roster.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-neutral-900 border border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">{p.avatar}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">{p.name}</p>
                        {p.pumpLabel && <p className="text-[11px] text-neutral-500 truncate">Habituelle : {p.pumpLabel}</p>}
                      </div>
                    </div>
                    <select
                      value={rosterDailyStatus(p)}
                      onChange={(e) => changeDailyStatus(p.id, e.target.value)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-lg border outline-none appearance-none cursor-pointer transition-colors flex-shrink-0 ${DAILY_COLOR[rosterDailyStatus(p)] || DAILY_COLOR.absent}`}
                    >
                      <option value="present" className="bg-neutral-900 text-white">Présent</option>
                      <option value="repos" className="bg-neutral-900 text-white">Repos</option>
                      <option value="conge" className="bg-neutral-900 text-white">Congé</option>
                      <option value="maladie" className="bg-neutral-900 text-white">Maladie</option>
                      <option value="absent" className="bg-neutral-900 text-white">Absent (Injustifié)</option>
                    </select>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ═══ Récapitulatif du jour ═══ */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <h2 className="text-xl font-bold text-white mb-2">Récapitulatif {isToday ? 'du jour' : '— Historique'}</h2>
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <div className="flex items-center gap-2 bg-neutral-900 border border-white/10 rounded-lg px-3 py-2">
                <Calendar className="w-4 h-4 text-neutral-500 flex-shrink-0" />
                <input
                  type="date" value={selectedDate} max={todayKey()}
                  onChange={(e) => setSelectedDate(e.target.value || todayKey())}
                  className="bg-transparent text-white text-sm outline-none [color-scheme:dark]"
                />
              </div>
              {!isToday && (
                <button type="button" onClick={() => setSelectedDate(todayKey())} className="text-xs font-bold text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors">
                  Revenir à aujourd'hui
                </button>
              )}
              <span className="text-sm text-neutral-500 capitalize">{selectedDateLabel}</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                ['Litres vendus', fmtLiters(summary.liters), 'text-blue-400'],
                ['Argent encaissé', fmtFcfa(summary.amount), 'text-emerald-400'],
                ['Prix moyen / litre', avgPrice != null ? fmtFcfa(avgPrice) : '—', 'text-neutral-200'],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-xl bg-neutral-900 border border-white/5 px-5 py-4">
                  <p className="text-xs uppercase tracking-wide text-neutral-500">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${cls}`}>{value}</p>
                </div>
              ))}
            </div>

            {summary.byPump.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-5">
                {summary.byPump.map((pp) => (
                  <div key={pp.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
                    <Fuel className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-bold text-white">{pp.label}</span>
                    <span className="text-neutral-400">{fmtLiters(pp.liters)} · {fmtFcfa(pp.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {detail.hasDetail && (
              <div className="mt-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {['essence', 'gasoil'].map((f) => (
                    <div key={f} className="rounded-xl bg-neutral-900 border border-white/5 px-4 py-3 flex items-center justify-between gap-3">
                      <NozzleChip label={FUEL_LABEL[f]} fuel={f} />
                      <span className="text-sm text-right"><b className="text-white">{fmtLiters(detail.byFuel[f].liters)}</b> <span className="text-neutral-600">·</span> <b className="text-emerald-400">{fmtFcfa(detail.byFuel[f].amount)}</b></span>
                    </div>
                  ))}
                </div>
                {detail.undetailed.count > 0 && (
                  <p className="text-xs text-neutral-500 mt-2">Hors ventilation (relevé saisi en un seul total) : {fmtLiters(detail.undetailed.liters)} · {fmtFcfa(detail.undetailed.amount)}</p>
                )}
                <details className="mt-3">
                  <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-300">Détail par pistolet ({detail.byNozzle.length})</summary>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {detail.byNozzle.map((n) => (
                      <div key={n.label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-900 border border-white/5 text-xs">
                        <NozzleChip label={n.label} fuel={n.fuel} />
                        <span className="text-neutral-400">{fmtLiters(n.liters)} · {fmtFcfa(n.amount)}</span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {pendingCount > 0 && (
              <p className="mt-5 text-sm text-amber-400 flex items-center gap-2"><Clock className="w-4 h-4" /> {pendingCount} relevé{pendingCount > 1 ? 's' : ''} à saisir.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══ Pointage, pompe du jour et relevé ═══ */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">Pointage {isToday ? 'Journalier' : '— Historique'}</h2>

          {activePumps.length === 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl px-4 py-3">
              <span>Aucune pompe déclarée : ajoutez les pompes à essence de la station pour pouvoir y poster vos pompistes.</span>
              {manageLink}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[860px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-4 font-semibold text-neutral-400">Pompiste</th>
                  <th className="p-4 font-semibold text-neutral-400">Pompe du jour</th>
                  <th className="p-4 font-semibold text-neutral-400 text-center">Prise de poste</th>
                  <th className="p-4 font-semibold text-neutral-400 text-center">Descente</th>
                  <th className="p-4 font-semibold text-neutral-400 text-center">Temps de travail</th>
                  <th className="p-4 font-semibold text-neutral-400">Relevé</th>
                  <th className="p-4 font-semibold text-neutral-400 text-right">Statut</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan="7" className="p-8 text-center text-neutral-500">
                    {isToday ? "Aucun pompiste sélectionné pour aujourd'hui." : 'Aucune donnée de pointage pour cette date.'}
                  </td></tr>
                ) : rows.map((row) => {
                  const current = pumpOf(row);
                  const finished = row.status === 'Terminé' || row.status === 'Fin de service';
                  return (
                    <tr key={row.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                      <td className="p-4 font-bold text-white">{row.name}</td>
                      <td className="p-4">
                        <select
                          value={current}
                          onChange={(e) => choosePump(row, e.target.value)}
                          disabled={activePumps.length === 0 && !current}
                          className={`${inputCls} w-40 appearance-none cursor-pointer`}
                          title="Pompe où travaille ce pompiste ce jour-là"
                        >
                          <option value="">{activePumps.length === 0 && !current ? 'Aucune pompe' : '— Choisir —'}</option>
                          {pumpOptionsFor(current).map((n) => <option key={n} value={n}>{n}</option>)}
                        </select>
                        {(() => {
                          const options = nozzlesOfPump(current);
                          const held = assignedOf(row);
                          // Pistolets figés sur ce jour mais qui ne sont plus ceux de la pompe (décochés depuis).
                          const stale = held.filter((l) => !options.some((n) => n.label === l));
                          const notice = notices[row.id];
                          if (options.length === 0 && stale.length === 0) return notice ? <p className="text-[11px] text-amber-400 mt-2 max-w-[280px]">{notice}</p> : null;
                          const busy = busyFor(row);
                          // Pistolets de la pompe pris par un autre pompiste en service : verrouillés.
                          const locked = options.filter((n) => !held.includes(n.label) && busy.has(n.label)).map((n) => n.label);
                          const shared = sharedOf(row);
                          return (
                            <div className="mt-2 max-w-[280px]">
                              <div className="flex flex-wrap gap-1" role="group" aria-label={`Pistolets tenus par ${row.name}`}>
                                {options.map((n) => {
                                  const lockedBy = locked.includes(n.label) ? busy.get(n.label) : null;
                                  return (
                                    <NozzleChip
                                      key={n.label} label={n.label} fuel={n.fuel} active={held.includes(n.label)}
                                      disabled={!!lockedBy} onClick={() => toggleNozzle(row, n.label)}
                                      title={lockedBy ? `Tenu par ${lockedBy} jusqu'à sa descente` : undefined}
                                    />
                                  );
                                })}
                                {stale.map((l) => <NozzleChip key={l} label={l} fuel={parseNozzleLabel(l)?.fuel || 'essence'} active onClick={() => toggleNozzle(row, l)} title="Ce pistolet n'est plus sur cette pompe" />)}
                              </div>
                              {options.length > 0 && held.length === 0 && locked.length < options.length && <p className="text-[11px] text-amber-400/80 mt-1">Aucun pistolet coché.</p>}
                              {locked.length > 0 && <p className="text-[11px] text-neutral-400 mt-1">🔒 {describeTaken(locked, busy)}</p>}
                              {shared.map((s) => (s.clash
                                ? <p key={s.label} className="text-[11px] text-amber-400 mt-1">⚠ {s.label} aussi tenu par {s.names}, en service</p>
                                : <p key={s.label} className="text-[11px] text-neutral-500 mt-1">Relais : {s.label} aussi tenu ce jour par {s.names}</p>))}
                              {notice && <p className="text-[11px] text-amber-400 mt-1">{notice}</p>}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-4 text-center font-bold text-emerald-400">{row.live.clockIn || '-'}</td>
                      <td className="p-4 text-center font-bold text-red-400">{row.live.clockOut || '-'}</td>
                      <td className="p-4 text-center font-bold text-blue-400">
                        <WorkedTimeCell member={row.live} status={row.status} live={isToday} />
                      </td>
                      <td className="p-4">
                        {hasReading(row) ? (
                          <div className="flex items-center gap-3">
                            <div className="text-sm">
                              <p className="font-bold text-white">{fmtLiters(row.saved.liters)}</p>
                              <p className="text-xs text-emerald-400">{fmtFcfa(row.saved.amountCollected)}</p>
                              {row.saved.pumpLines?.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {row.saved.pumpLines.map((l) => (
                                    <p key={l.label} className="text-[11px] text-neutral-500 whitespace-nowrap">{l.label} · {l.liters != null ? fmtLiters(l.liters) : fmtFcfa(l.amount)}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button onClick={() => setReadingRowId(row.id)} title="Modifier le relevé" className="p-1.5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : finished || !isToday ? (
                          <button onClick={() => setReadingRowId(row.id)} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-200 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 transition-colors">
                            <ClipboardEdit className="w-3.5 h-3.5" /> Saisir le relevé
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-500">Après la descente</span>
                        )}
                      </td>
                      <td className="p-4 text-right">
                        {isToday ? (
                          <div className="flex justify-end gap-2">
                            {row.status === 'Actif' && (
                              <button onClick={() => handleClockOut(row.id)} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-red-500/20">
                                Descente
                              </button>
                            )}
                            {row.status === 'Terminé' && (
                              <>
                                {!isPastClosingTime(stationProfile) && (
                                  <button onClick={() => handleResume(row)} className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-bold text-xs transition-colors shadow-lg shadow-emerald-500/20">
                                    Reprendre service
                                  </button>
                                )}
                                <button onClick={() => finishService(row.id)} className="px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg font-bold text-xs transition-colors">
                                  Fin de service
                                </button>
                              </>
                            )}
                            {row.status === 'Fin de service' && <span className="text-xs text-neutral-500 italic">Journée terminée</span>}
                          </div>
                        ) : (
                          <Badge variant="outline" className={`flex items-center gap-1.5 w-fit ml-auto ${STATUS_COLOR[row.status] || STATUS_COLOR['Fin de service']}`}>
                            {STATUS_ICON[row.status]} {row.status}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-neutral-500 mt-5">
            Un pistolet ne sert qu'à un pompiste en service à la fois : il se libère à la descente de celui qui le tient, pour le relais.
          </p>
          <p className="text-xs text-neutral-600 mt-1">
            Ces montants sont suivis à part : ils n'entrent ni dans les transactions de lavage, ni dans le Bilan ou l'Analytique.
          </p>
        </CardContent>
      </Card>

      {readingRow && (
        <ReadingModal
          key={readingRow.id}
          row={readingRow}
          dateLabel={selectedDateLabel}
          pumpOptions={pumpOptionsFor(pumpOf(readingRow))}
          nozzlesOfPump={nozzlesOfPump}
          initial={{
            pump: pumpOf(readingRow), liters: toInputValue(readingRow.saved?.liters), amount: toInputValue(readingRow.saved?.amountCollected),
            assigned: assignedOf(readingRow), lines: readingRow.saved?.pumpLines || [],
          }}
          onSave={(values) => saveReading(readingRow, values)}
          onClose={() => setReadingRowId(null)}
        />
      )}
    </div>
  );
}
