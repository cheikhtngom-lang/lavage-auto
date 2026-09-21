import React, { useState, useEffect, useMemo } from 'react';
import { Fuel, Plus, Pencil, Check, X, Trash2, RotateCcw, Loader2, UserPlus, ListChecks } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import NozzleChip from './NozzleChip';
import { useAppState } from '../../hooks/useAppState';
import { POMPISTE_ROLE, FUELS, MAX_NOZZLE_NUMBER, nozzleKey, nozzleLabel, firstFreePair } from '../../lib/pompistes';

// Paramètres > Pompistes & pompes : la configuration de la station, comme la
// création des laveurs. Le quotidien (présence, pompe du jour, descente, relevé)
// se fait dans la page Pompistes.
const inputCls = 'bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors';

const PUMP_ERRORS = {
  duplicate: 'Une pompe porte déjà ce nom.',
  empty: 'Le nom de la pompe est requis.',
  too_long: '40 caractères au plus.',
  failed: 'Enregistrement impossible. Réessayez.',
  no_station: 'Station introuvable.',
  nozzles_failed: "La pompe est créée, mais ses pistolets n'ont pas pu être enregistrés : ouvrez « Pistolets » sur la pompe pour les cocher.",
};
const taken = (holder) => `Un des pistolets cochés est déjà sur « ${holder} » : un pistolet n'appartient qu'à une pompe.`;

// Grille à cocher des pistolets d'une pompe : une ligne par numéro, Essence à gauche, Gasoil à
// droite. Le gérant décide : parfois seulement Essence 1 + Gasoil 1, parfois plus, parfois un
// seul carburant. Un pistolet déjà porté par une autre pompe active est grisé (il n'a qu'une pompe).
function NozzlePicker({ pumps, pumpId, value, onChange }) {
  const holderOf = (fuel, number) => pumps.find((p) => p.id !== pumpId && p.active && p.nozzles.some((n) => n.fuel === fuel && n.number === number))?.name;
  const highest = Math.max(4, ...pumps.flatMap((p) => p.nozzles.map((n) => n.number)), ...[...value].map((k) => Number(k.split(':')[1])));
  const [extra, setExtra] = useState(0);
  const rows = Math.min(MAX_NOZZLE_NUMBER, Math.max(highest, extra));

  const toggle = (fuel, number) => {
    const next = new Set(value);
    const k = nozzleKey(fuel, number);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange(next);
  };

  return (
    <div className="rounded-xl bg-neutral-950/60 border border-white/5 p-4">
      <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-3 gap-y-2 items-center">
        <span />
        {FUELS.map((f) => <span key={f.key} className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{f.label}</span>)}
        {Array.from({ length: rows }, (_, i) => i + 1).map((n) => (
          <React.Fragment key={n}>
            <span className="text-sm font-bold text-neutral-500">{n}</span>
            {FUELS.map((f) => {
              const holder = holderOf(f.key, n);
              return (
                <div key={f.key} className="min-w-0">
                  <NozzleChip
                    label={nozzleLabel(f.key, n)} fuel={f.key} active={value.has(nozzleKey(f.key, n))}
                    disabled={!!holder} onClick={() => toggle(f.key, n)} title={holder ? `Déjà sur ${holder}` : undefined}
                  />
                  {holder && <span className="ml-2 text-[11px] text-neutral-600">{holder}</span>}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {rows < MAX_NOZZLE_NUMBER && (
        <button type="button" onClick={() => setExtra(rows + 1)} className="mt-3 text-xs font-bold text-blue-400 hover:text-blue-300">
          + Ajouter une ligne (Essence {rows + 1} / Gasoil {rows + 1})
        </button>
      )}
    </div>
  );
}

const keysToPicks = (keys) => [...keys].map((k) => { const [fuel, n] = k.split(':'); return { fuel, number: Number(n) }; });

export default function PompistesSetup() {
  const { employees, pumps, addEmployee, updateEmployee, addPump, renamePump, setPumpActive, setPumpNozzles } = useAppState();

  const activePumps = pumps.filter((p) => p.active);
  const retiredPumps = pumps.filter((p) => !p.active);
  const pompistes = (employees || []).filter((e) => e.role === POMPISTE_ROLE && e.status !== 'Archivé');

  // ─── Pompes ────────────────────────────────────────────────────────
  const [newPumpName, setNewPumpName] = useState('');
  const [pumpBusy, setPumpBusy] = useState(false);
  const [pumpError, setPumpError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  // Pistolets cochés pour la NOUVELLE pompe : par défaut la première paire Essence n + Gasoil n
  // encore libre (le cas courant : une pompe = Essence 1 + Gasoil 1), tant que le gérant n'a pas
  // touché à la grille.
  const takenKeys = useMemo(() => new Set(pumps.filter((p) => p.active).flatMap((p) => p.nozzles.map((n) => nozzleKey(n.fuel, n.number)))), [pumps]);
  const takenSig = [...takenKeys].sort().join(',');
  const [newPicks, setNewPicks] = useState(() => new Set());
  const [picksTouched, setPicksTouched] = useState(false);
  useEffect(() => {
    if (picksTouched) return;
    const n = firstFreePair(takenKeys);
    setNewPicks(n ? new Set([nozzleKey('essence', n), nozzleKey('gasoil', n)]) : new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takenSig, picksTouched]);

  const [optionsId, setOptionsId] = useState(null); // pompe dont on modifie les pistolets
  const [optionPicks, setOptionPicks] = useState(() => new Set());
  const [optionsBusy, setOptionsBusy] = useState(false);
  const openOptions = (p) => { setOptionsId(p.id); setOptionPicks(new Set(p.nozzles.map((n) => nozzleKey(n.fuel, n.number)))); setPumpError(''); setEditingId(null); };
  const saveOptions = async (p) => {
    setOptionsBusy(true);
    setPumpError('');
    const { success, error, holder } = await setPumpNozzles(p.id, keysToPicks(optionPicks));
    setOptionsBusy(false);
    if (success) setOptionsId(null);
    else setPumpError(error === 'taken' ? taken(holder) : PUMP_ERRORS[error] || PUMP_ERRORS.failed);
  };

  const submitPump = async (e) => {
    e.preventDefault();
    setPumpBusy(true);
    setPumpError('');
    const { success, error, holder } = await addPump(newPumpName, keysToPicks(newPicks));
    setPumpBusy(false);
    if (success) { setNewPumpName(''); setPicksTouched(false); }
    if (error) setPumpError(error === 'taken' ? taken(holder) : PUMP_ERRORS[error] || PUMP_ERRORS.failed);
  };
  const startEdit = (p) => { setEditingId(p.id); setEditName(p.name); setPumpError(''); };
  const submitRename = async (p) => {
    setPumpBusy(true);
    setPumpError('');
    const { success, error } = await renamePump(p.id, editName);
    setPumpBusy(false);
    if (success) setEditingId(null);
    else setPumpError(PUMP_ERRORS[error] || PUMP_ERRORS.failed);
  };
  const retirePump = (p) => {
    if (!window.confirm(`Retirer « ${p.name} » ? Elle ne sera plus proposée pour poster un pompiste ; les relevés passés la gardent.`)) return;
    setPumpActive(p.id, false);
  };

  // ─── Pompistes ─────────────────────────────────────────────────────
  const [newName, setNewName] = useState('');
  const [newPump, setNewPump] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const submitPompiste = async (e) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    const { success } = await addEmployee({ name, role: POMPISTE_ROLE, access: 'Aucun', pumpLabel: newPump });
    setAdding(false);
    if (success) { setNewName(''); setNewPump(''); }
    else setAddError("Ajout impossible. Vérifiez votre connexion puis réessayez.");
  };
  const removePompiste = (p) => {
    if (!window.confirm(`Retirer ${p.name} de la liste des pompistes ? Son historique de pointage et de relevés est conservé.`)) return;
    updateEmployee(p.id, { status: 'Archivé', dailyStatus: 'repos' });
  };

  // Options d'une liste de pompes : les pompes actives + la valeur courante si elle n'y est plus.
  const optionsFor = (current) => {
    const names = activePumps.map((p) => p.name);
    if (current && !names.some((n) => n.toLowerCase() === current.toLowerCase())) names.push(current);
    return names;
  };

  return (
    <div className="space-y-6">
      {/* ═══ Pompes à essence ═══ */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><Fuel className="w-5 h-5 text-blue-400" /> Pompes à essence</h2>
          <p className="text-neutral-400 mb-6">Déclarez les pompes de votre station (ex : Pompe A, Pompe B) et cochez leurs pistolets : Essence 1, Gasoil 1, Essence 2… À vous de définir ce que porte chaque pompe (souvent seulement Essence 1 + Gasoil 1). Chaque jour, vous posterez vos pompistes sur une pompe, avec les pistolets qu'ils tiennent, depuis la page Pompistes.</p>

          <form onSubmit={submitPump} className="mb-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text" maxLength={40} value={newPumpName} onChange={(e) => setNewPumpName(e.target.value)}
                placeholder="Nom de la pompe (ex : Pompe B)" className={`${inputCls} flex-1`}
              />
              <button
                type="submit" disabled={pumpBusy || !newPumpName.trim()}
                className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
              >
                {pumpBusy && editingId === null ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Ajouter la pompe
              </button>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mt-4 mb-2">Pistolets de cette pompe (cochez)</p>
            <NozzlePicker pumps={pumps} pumpId={null} value={newPicks} onChange={(next) => { setPicksTouched(true); setNewPicks(next); }} />
          </form>
          {pumpError && <p className="text-sm text-red-400 mb-2">{pumpError}</p>}

          <div className="mt-5 space-y-2">
            {activePumps.length === 0 && <p className="text-sm text-neutral-500 py-3">Aucune pompe pour l'instant.</p>}
            {activePumps.map((p) => (
              <div key={p.id} className="px-4 py-3 rounded-xl bg-neutral-900 border border-white/5">
                <div className="flex items-center gap-3">
                  <Fuel className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  {editingId === p.id ? (
                    <>
                      <input
                        autoFocus type="text" maxLength={40} value={editName} onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitRename(p); } if (e.key === 'Escape') setEditingId(null); }}
                        className={`${inputCls} flex-1 !py-1.5 text-sm`}
                      />
                      <button onClick={() => submitRename(p)} disabled={pumpBusy || !editName.trim()} title="Enregistrer" className="p-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg transition-colors"><Check className="w-4 h-4" /></button>
                      <button onClick={() => setEditingId(null)} title="Annuler" className="p-1.5 bg-white/5 hover:bg-white/10 text-neutral-400 rounded-lg transition-colors"><X className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 min-w-0 truncate font-medium text-white">{p.name}</span>
                      <button onClick={() => (optionsId === p.id ? setOptionsId(null) : openOptions(p))} title="Modifier les pistolets" className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors"><ListChecks className="w-3.5 h-3.5" /> Pistolets</button>
                      <button onClick={() => startEdit(p)} title="Renommer" className="p-1.5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => retirePump(p)} title="Retirer" className="p-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 mt-2.5 pl-7">
                  {p.nozzles.length === 0
                    ? <span className="text-xs text-neutral-600">Aucun pistolet coché : le relevé se saisit en un seul total.</span>
                    : p.nozzles.map((n) => <NozzleChip key={n.id} label={n.label} fuel={n.fuel} />)}
                </div>
                {optionsId === p.id && (
                  <div className="mt-4">
                    <NozzlePicker pumps={pumps} pumpId={p.id} value={optionPicks} onChange={setOptionPicks} />
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => saveOptions(p)} disabled={optionsBusy} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                        {optionsBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Enregistrer les pistolets
                      </button>
                      <button onClick={() => setOptionsId(null)} className="px-4 py-2 rounded-xl border border-white/10 text-neutral-300 hover:text-white hover:bg-white/5 text-sm font-medium transition-colors">Annuler</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {retiredPumps.length > 0 && (
            <details className="mt-5">
              <summary className="text-sm text-neutral-500 cursor-pointer hover:text-neutral-300">Pompes retirées ({retiredPumps.length})</summary>
              <div className="mt-3 space-y-2">
                {retiredPumps.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-neutral-900/50 border border-white/5">
                    <span className="flex-1 min-w-0 truncate text-neutral-500">{p.name}</span>
                    <button onClick={() => setPumpActive(p.id, true)} className="flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 transition-colors">
                      <RotateCcw className="w-3.5 h-3.5" /> Réactiver
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}
        </CardContent>
      </Card>

      {/* ═══ Pompistes ═══ */}
      <Card className="border-white/5 bg-white/[0.02]">
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2"><UserPlus className="w-5 h-5 text-blue-400" /> Création d'un profil pompiste</h2>
          <p className="text-neutral-400 mb-6">Ajoutez vos pompistes comme vos laveurs. La pompe habituelle est proposée par défaut chaque jour ; vous pouvez poster un pompiste sur une autre pompe depuis la page Pompistes.</p>

          <form onSubmit={submitPompiste} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 mb-2">
            <input
              type="text" required maxLength={100} value={newName} onChange={(e) => setNewName(e.target.value)}
              placeholder="Nom du pompiste" className={inputCls}
            />
            <select value={newPump} onChange={(e) => setNewPump(e.target.value)} className={`${inputCls} appearance-none`}>
              <option value="">{activePumps.length ? 'Pompe habituelle (facultatif)' : 'Ajoutez d\'abord une pompe'}</option>
              {activePumps.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
            <button
              type="submit" disabled={adding || !newName.trim()}
              className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-xl transition-colors"
            >
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Ajouter
            </button>
          </form>
          {addError && <p className="text-sm text-red-400 mb-2">{addError}</p>}

          <div className="mt-5 space-y-2">
            {pompistes.length === 0 && <p className="text-sm text-neutral-500 py-3">Aucun pompiste pour l'instant.</p>}
            {pompistes.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900 border border-white/5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-purple-600 flex items-center justify-center font-bold text-white text-xs flex-shrink-0">{p.avatar}</div>
                <span className="flex-1 min-w-[120px] truncate font-medium text-white">{p.name}</span>
                <select
                  value={p.pumpLabel || ''} onChange={(e) => updateEmployee(p.id, { pumpLabel: e.target.value || null })}
                  title="Pompe habituelle" className={`${inputCls} !py-1.5 text-sm appearance-none min-w-[150px]`}
                >
                  <option value="">Sans pompe habituelle</option>
                  {optionsFor(p.pumpLabel).map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={() => removePompiste(p)} title="Retirer de la liste" className="p-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
