import React, { useState } from 'react';
import { Fuel, Plus, Pencil, Check, X, Trash2, RotateCcw, Loader2, UserPlus } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';
import { useAppState } from '../../hooks/useAppState';
import { POMPISTE_ROLE } from '../../lib/pompistes';

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
};

export default function PompistesSetup() {
  const { employees, pumps, addEmployee, updateEmployee, addPump, renamePump, setPumpActive } = useAppState();

  const activePumps = pumps.filter((p) => p.active);
  const retiredPumps = pumps.filter((p) => !p.active);
  const pompistes = (employees || []).filter((e) => e.role === POMPISTE_ROLE && e.status !== 'Archivé');

  // ─── Pompes ────────────────────────────────────────────────────────
  const [newPumpName, setNewPumpName] = useState('');
  const [pumpBusy, setPumpBusy] = useState(false);
  const [pumpError, setPumpError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const submitPump = async (e) => {
    e.preventDefault();
    setPumpBusy(true);
    setPumpError('');
    const { success, error } = await addPump(newPumpName);
    setPumpBusy(false);
    if (success) setNewPumpName('');
    else setPumpError(PUMP_ERRORS[error] || PUMP_ERRORS.failed);
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
          <p className="text-neutral-400 mb-6">Déclarez les pompes de votre station (ex : Pompe 1, Pompe B, Gasoil). Chaque jour, vous posterez vos pompistes sur l'une d'elles depuis la page Pompistes.</p>

          <form onSubmit={submitPump} className="flex flex-col sm:flex-row gap-3 mb-2">
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
          </form>
          {pumpError && <p className="text-sm text-red-400 mb-2">{pumpError}</p>}

          <div className="mt-5 space-y-2">
            {activePumps.length === 0 && <p className="text-sm text-neutral-500 py-3">Aucune pompe pour l'instant.</p>}
            {activePumps.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-900 border border-white/5">
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
                    <button onClick={() => startEdit(p)} title="Renommer" className="p-1.5 bg-white/5 hover:bg-blue-500/20 hover:text-blue-400 text-neutral-400 rounded-lg transition-colors"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => retirePump(p)} title="Retirer" className="p-1.5 bg-white/5 hover:bg-red-500/20 hover:text-red-400 text-neutral-400 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
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
