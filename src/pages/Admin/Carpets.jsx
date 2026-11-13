// Rubriques station « Tapis » et « Chaussures » (même page, prop `activity`) :
// tapis, moquettes ou chaussures déposés par les clients. Enregistrer un
// dépôt, le faire avancer (lavage, séchage, prêt, récupéré), l'encaisser
// (transaction « Tapis » ou « Chaussures » en Comptabilité) et envoyer au
// client le lien de suivi sur WhatsApp. Voir add_carpet_cleaning.sql et
// add_shoe_cleaning.sql.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Layers, Footprints, Plus, X, Search, MessageCircle, Link2, Check, Coins, ChevronDown, Undo2, Pencil, Ban, Clock, AlertTriangle, Trash2, Building2, Send, Phone,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { useAppState } from '../../hooks/useAppState';
import { useStationCarpets } from '../../hooks/useStationCarpets';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { cn } from '../../lib/utils';
import {
  CARPET_DELAYS, DEFAULT_CARPET_DELAY, CARPET_STEPS, CARPET_STATUS, NEXT_STATUS, NEXT_ACTION_LABEL,
  isOpenCarpet, isLateCarpet, stepIndex, orderSummary, fcfa, formatPromise, timeLeftLabel, carpetTrackingUrl,
  depositMessage, readyMessage, carpetWhatsAppLink, createCarpetOrder, setCarpetStatus, updateCarpetOrder,
  recordCarpetPayment, activityConfig, unitCount, CLIENT_DEPOSITS_LABEL, newPiece, pieceLines, pieceLabel, piecesTotal, piecesWithoutPrice, orderToPieces,
  loadPartnerStations, stationPlace, outsourceCarpet, cancelOutsource,
} from '../../lib/carpets';
import { whatsappLink } from '../../lib/subscriptionReminders';

const METHODS = ['Espèces', 'Wave', 'Orange Money', 'Carte'];
const PREV_STATUS = { lavage: 'depose', sechage: 'lavage', pret: 'sechage', recupere: 'pret' };
const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500';

// Heure pleine suivante + délai : « prêt sous 48 h » déposé à 14 h 37 = 15 h dans 2 jours.
function promiseFromDelay(hours, from = new Date()) {
  const d = new Date(from);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1 + hours);
  return d;
}
const toLocalInput = (date) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const delayLabel = (h) => (h % 24 === 0 && h > 48 ? `${h / 24} jours` : `${h} h`);

const TONE = {
  neutral: 'bg-white/5 text-neutral-300 border-white/10',
  blue: 'bg-blue-500/10 text-blue-300 border-blue-500/25',
  cyan: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25',
  emerald: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/25',
  red: 'bg-red-500/10 text-red-300 border-red-500/25',
};

// Rubrique ouverte (tapis ou chaussures) : libellés, types de pièces, service.
const ActivityContext = createContext(activityConfig('tapis'));
const useActivity = () => useContext(ActivityContext);

// Rendue dans <body> : la page est un contexte d'empilement (relative z-10),
// une fenêtre restée dedans passerait sous le menu et le bandeau d'essai.
function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4 bg-black/70" role="dialog" aria-modal="true" aria-label={title}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
        className="bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full sm:max-w-lg shadow-2xl relative max-h-[92dvh] overflow-y-auto"
      >
        <button onClick={onClose} className="modal-close" aria-label="Fermer" title="Fermer"><X className="w-6 h-6" /></button>
        <h2 className="text-xl font-bold text-white mb-5 pr-10">{title}</h2>
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}

function Stepper({ status }) {
  const idx = stepIndex(status);
  const cancelled = status === 'annule';
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Étape : ${CARPET_STATUS[status]?.label}`}>
      {CARPET_STEPS.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            title={s.label}
            className={cn('h-1.5 w-7 rounded-full', cancelled ? 'bg-white/10' : i <= idx ? (idx === CARPET_STEPS.length - 1 ? 'bg-emerald-400' : 'bg-blue-400') : 'bg-white/10')}
          />
        </li>
      ))}
    </ol>
  );
}

function ShareLink({ order, stationName, ready }) {
  const [copied, setCopied] = useState(false);
  const wa = carpetWhatsAppLink(order, ready ? readyMessage(order, stationName) : depositMessage(order, stationName));
  const copy = async () => {
    try { await navigator.clipboard.writeText(carpetTrackingUrl(order.publicToken)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* presse-papiers refusé */ }
  };
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {wa ? (
        <a href={wa} target="_blank" rel="noopener noreferrer" className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-3 rounded-xl transition-colors">
          <MessageCircle className="w-4 h-4" /> {ready ? 'Prévenir sur WhatsApp' : 'Envoyer le lien sur WhatsApp'}
        </a>
      ) : (
        <p className="flex-1 text-sm text-neutral-400 bg-white/5 rounded-xl px-4 py-3">Pas de numéro WhatsApp : copiez le lien et envoyez-le au client.</p>
      )}
      <button type="button" onClick={copy} className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium px-4 py-3 rounded-xl transition-colors">
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Link2 className="w-4 h-4" />} {copied ? 'Lien copié' : 'Copier le lien'}
      </button>
    </div>
  );
}

// Pièces une par une : chaque type touché ajoute une pièce avec sa taille, son
// prix et sa note interne ; le total est la somme des prix.
function PiecesEditor({ pieces, onChange, lockPrices = false, fallbackTotal = 0 }) {
  const cfg = useActivity();
  const [focusId, setFocusId] = useState(null);
  const add = (kind) => {
    const piece = newPiece(kind);
    onChange([...pieces, piece]);
    setFocusId(piece.id);
  };
  const patch = (id, field, value) => onChange(pieces.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const remove = (id) => onChange(pieces.filter((p) => p.id !== id));
  const total = piecesTotal(pieces);
  const missing = piecesWithoutPrice(pieces);
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-neutral-400 mb-2">{cfg.piecesLegend}</legend>
      <div className="flex flex-wrap gap-2 mb-3">
        {cfg.kinds.map((kind) => (
          <button key={kind} type="button" onClick={() => add(kind)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors">
            <Plus className="w-4 h-4 text-blue-400" /> {kind}
          </button>
        ))}
      </div>

      {pieces.length === 0 ? (
        <p className="text-sm text-neutral-500 rounded-xl border border-dashed border-white/10 px-4 py-5 text-center">{cfg.editorHint}</p>
      ) : (
        <ol className="space-y-3">
          {pieces.map((p, i) => (
            <li key={p.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2 mb-2.5">
                <p className="text-sm font-bold text-white"><span className="text-neutral-500 font-medium tabular-nums">{cfg.unitCap} {i + 1} · </span>{p.kind}</p>
                <button type="button" onClick={() => remove(p.id)} aria-label={`Retirer la ${cfg.unit} ${i + 1}`} title={`Retirer cette ${cfg.unit}`}
                  className="w-9 h-9 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor={`size-${p.id}`} className="block text-xs text-neutral-500 mb-1">{cfg.sizeLabel}</label>
                  <input id={`size-${p.id}`} className={inputCls} value={p.size} onChange={(e) => patch(p.id, 'size', e.target.value)} placeholder={cfg.sizePlaceholder} autoComplete="off"
                    autoFocus={focusId === p.id} />
                </div>
                <div>
                  <label htmlFor={`price-${p.id}`} className="block text-xs text-neutral-500 mb-1">Prix (FCFA)</label>
                  <input id={`price-${p.id}`} className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="100" inputMode="numeric" value={p.price}
                    onChange={(e) => patch(p.id, 'price', e.target.value)} placeholder={cfg.pricePlaceholder} disabled={lockPrices} />
                </div>
              </div>
              <label htmlFor={`note-${p.id}`} className="block text-xs text-neutral-500 mt-2 mb-1">Note interne (jamais vue par le client)</label>
              <input id={`note-${p.id}`} className={inputCls} value={p.note} onChange={(e) => patch(p.id, 'note', e.target.value)} placeholder={cfg.notePlaceholder} autoComplete="off" />
            </li>
          ))}
        </ol>
      )}

      {pieces.length > 0 && (
        <div className="flex items-baseline justify-between gap-3 mt-3 px-1">
          <span className="text-sm text-neutral-400">
            Prix total{missing > 0 ? <span className="text-amber-400"> · {unitCount(missing, cfg)} sans prix</span> : null}
          </span>
          <span className="text-xl font-bold text-white tabular-nums">{fcfa(total || fallbackTotal)}</span>
        </div>
      )}
      {!total && fallbackTotal > 0 && (
        <p className="text-xs text-neutral-500 mt-1 px-1">Total saisi avant le détail par pièce. Il reste tel quel tant qu'aucun prix de pièce n'est indiqué.</p>
      )}
    </fieldset>
  );
}

function PieceList({ order, showNotes = false }) {
  const lines = pieceLines(order.items);
  return (
    <ul className="space-y-1">
      {lines.map((p) => (
        <li key={p.id} className="text-sm">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-neutral-300 min-w-0">{pieceLabel(p)}</span>
            <span className="text-neutral-400 tabular-nums shrink-0">{p.price ? fcfa(p.price) : order.amount > 0 ? '' : 'prix à fixer'}</span>
          </span>
          {showNotes && order.pieceNotes?.[p.id] && <span className="block text-xs text-neutral-500 italic">« {order.pieceNotes[p.id]} »</span>}
        </li>
      ))}
    </ul>
  );
}

// Liste des stations Galsen (sauf la sienne), avec recherche.
function StationPicker({ myStationId, value, onChange }) {
  const [stations, setStations] = useState(null);
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPartnerStations(myStationId).then((list) => { if (!cancelled) setStations(list); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [myStationId]);
  const needle = q.trim().toLowerCase();
  const shown = (stations || []).filter((st) => !needle || `${st.name} ${stationPlace(st)}`.toLowerCase().includes(needle)).slice(0, 30);
  if (failed) return <p className="text-sm text-red-400">La liste des stations n'a pas pu être lue. Réessayez.</p>;
  return (
    <div>
      <div className="relative mb-2">
        <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou quartier de la station" aria-label="Rechercher une station"
          className={cn(inputCls, 'pl-9')} />
      </div>
      <div className="rounded-xl border border-white/10 max-h-56 overflow-y-auto divide-y divide-white/5" role="listbox" aria-label="Stations">
        {stations == null ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Chargement des stations…</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-4 text-sm text-neutral-500">Aucune station trouvée.</p>
        ) : shown.map((st) => (
          <button key={st.id} type="button" role="option" aria-selected={value?.id === st.id} onClick={() => onChange(st)}
            className={cn('w-full text-left px-4 py-3 flex items-center gap-3 transition-colors', value?.id === st.id ? 'bg-blue-600/20' : 'hover:bg-white/5')}>
            <Building2 className={cn('w-4 h-4 shrink-0', value?.id === st.id ? 'text-blue-300' : 'text-neutral-500')} />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-white truncate">{st.name}</span>
              {stationPlace(st) && <span className="block text-xs text-neutral-500 truncate">{stationPlace(st)}</span>}
            </span>
            {value?.id === st.id && <Check className="w-4 h-4 text-blue-300 ml-auto shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function OutsourceModal({ order, myStationId, onClose, onDone }) {
  const cfg = useActivity();
  const [partner, setPartner] = useState(null);
  // Date promise au client par défaut ; déjà passée (dépôt en retard) : dans 48 h.
  const [promisedAt, setPromisedAt] = useState(() => toLocalInput(new Date(order.promisedAt) > new Date() ? order.promisedAt : promiseFromDelay(DEFAULT_CARPET_DELAY)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!partner) { setError(`Choisissez la station qui lavera ces ${cfg.units}.`); return; }
    setSaving(true);
    setError('');
    try { await outsourceCarpet(order.id, partner.id, new Date(promisedAt).toISOString()); onDone(); onClose(); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Confier le ticket n° ${order.ticketNo} à une autre station`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-400">
          {order.clientName} · {orderSummary(order)}. La station choisie reçoit le dépôt dans sa rubrique {cfg.nav}, à votre nom ; elle fixe son prix.
        </p>
        <StationPicker myStationId={myStationId} value={partner} onChange={setPartner} />
        <div>
          <label htmlFor="out-date" className="block text-sm font-medium text-neutral-400 mb-1">À rendre au plus tard le</label>
          <input id="out-date" type="datetime-local" className={inputCls} value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} required />
        </div>
        <ul className="text-xs text-neutral-500 space-y-1 list-disc pl-4">
          <li>L'avancement chez elle se recopie sur le dépôt de votre client : il le voit sur son lien.</li>
          <li>Quand vous récupérez les {cfg.things} chez elle, le dépôt de votre client passe à « Prêt ».</li>
          <li>Ce que vous lui payez s'ajoute à vos dépenses (« {cfg.service} (station partenaire) »).</li>
        </ul>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving || !partner} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Envoi…' : partner ? `Confier à ${partner.name}` : 'Choisissez une station'}
        </button>
      </form>
    </Modal>
  );
}

// Dépôt de la station chez une station partenaire (onglet « Chez un partenaire »).
function SentRow({ order, ownOrder, onTakeBack, busy }) {
  const cfg = useActivity();
  const status = CARPET_STATUS[order.status] || CARPET_STATUS.depose;
  const partner = order.partner || {};
  const call = partner.owner_phone ? `tel:${String(partner.owner_phone).replace(/[^\d+]/g, '')}` : null;
  const wa = whatsappLink(partner.owner_phone, `Bonjour, je viens aux nouvelles de nos ${cfg.things} (ticket n° ${order.ticketNo} chez vous).`);
  const open = isOpenCarpet(order);
  return (
    <div className={cn('p-4 sm:p-5 border-b border-white/5 last:border-0', !open && 'opacity-70')}>
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="flex-1 min-w-[200px]">
          <p className="font-bold text-white flex items-center gap-2"><Building2 className="w-4 h-4 text-blue-400 shrink-0" /> {partner.name || 'Station partenaire'}</p>
          <p className="text-neutral-500 text-xs mt-0.5">Ticket n° {order.ticketNo} chez elle{stationPlace(partner) ? ` · ${stationPlace(partner)}` : ''}</p>
          <p className="text-neutral-400 text-sm mt-1">{orderSummary(order)}</p>
          {ownOrder && <p className="text-neutral-500 text-xs mt-1">Pour votre ticket n° {ownOrder.ticketNo} · {ownOrder.clientName}</p>}
        </div>
        <div className="min-w-[190px]">
          <span className={cn('inline-block text-xs font-medium px-2.5 py-0.5 rounded-md border mb-1.5', TONE[status.tone])}>{order.status === 'pret' ? 'Prêt : à récupérer chez elle' : status.label}</span>
          <Stepper status={order.status} />
          {['depose', 'lavage', 'sechage'].includes(order.status) && (
            <p className={cn('text-xs mt-1.5 flex items-center gap-1', isLateCarpet(order) ? 'text-red-400 font-medium' : 'text-neutral-400')}>
              <Clock className="w-3.5 h-3.5" /> Promis {formatPromise(order.promisedAt)} · {timeLeftLabel(order.promisedAt)}
            </p>
          )}
        </div>
        <div className="sm:text-right min-w-[110px]">
          <p className="text-white font-bold tabular-nums">{order.amount ? fcfa(order.amount) : '—'}</p>
          <p className={cn('text-xs mt-0.5', order.paid ? 'text-emerald-400' : 'text-neutral-500')}>{order.paid ? 'Payé (dans vos dépenses)' : order.amount ? 'À lui payer' : 'Prix fixé par elle'}</p>
        </div>
      </div>
      {open && (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {call && <a href={call} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"><Phone className="w-4 h-4" /> Appeler</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors"><MessageCircle className="w-4 h-4 text-emerald-400" /> WhatsApp</a>}
          {ownOrder && order.status === 'depose' && (
            <button type="button" onClick={() => onTakeBack(ownOrder)} disabled={busy} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-60">
              <Undo2 className="w-4 h-4" /> Reprendre
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function NewDepositModal({ stationId, stationName, onClose, onSaved }) {
  const cfg = useActivity();
  const [form, setForm] = useState({ clientName: '', clientPhone: '', paidNow: false, method: 'Espèces' });
  const [pieces, setPieces] = useState([]);
  // Client = une autre station Galsen : elle suivra le dépôt et son paiement sera une dépense chez elle.
  const [clientStation, setClientStation] = useState(null);
  const [isStationClient, setIsStationClient] = useState(false);
  const pickStation = (st) => { setClientStation(st); setForm((f) => ({ ...f, clientName: st.name, clientPhone: st.owner_phone || '' })); };
  const [delay, setDelay] = useState(DEFAULT_CARPET_DELAY);
  const [customDate, setCustomDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const total = piecesTotal(pieces);
  const promise = delay === 'custom' ? (customDate ? new Date(customDate) : null) : promiseFromDelay(delay);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isStationClient && !clientStation) { setError('Choisissez la station cliente.'); return; }
    if (!form.clientName.trim()) { setError('Indiquez le nom du client.'); return; }
    if (pieces.length < 1) { setError(`Ajoutez au moins une ${cfg.unit}.`); return; }
    if (!promise || Number.isNaN(promise.getTime())) { setError('Choisissez la date à laquelle ce sera prêt.'); return; }
    if (form.paidNow && !(total > 0)) { setError(`Indiquez le prix des ${cfg.units} pour encaisser maintenant.`); return; }
    setSaving(true);
    try {
      let order = await createCarpetOrder(stationId, {
        clientName: form.clientName, clientPhone: form.clientPhone,
        pieces, promisedAt: promise.toISOString(),
        fromStationId: isStationClient ? clientStation?.id : null,
        activity: cfg.key,
      });
      if (form.paidNow) {
        await recordCarpetPayment(order.id, form.method, total);
        order = { ...order, paid: true, paymentMethod: form.method };
      }
      onSaved(order);
      setSaved(order);
    } catch (err) {
      setError(err.message || "Le dépôt n'a pas pu être enregistré.");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <Modal title="Dépôt enregistré" onClose={onClose}>
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5 mb-5">
          <p className="text-neutral-400 text-sm">Ticket</p>
          <p className="text-4xl font-bold text-white tabular-nums">n° {saved.ticketNo}</p>
          <p className="text-white mt-3 mb-2 font-medium">{saved.clientName}</p>
          <PieceList order={saved} />
          {saved.amount > 0 && (
            <p className="flex justify-between text-sm mt-2 pt-2 border-t border-white/10"><span className="text-neutral-400">Total{saved.paid ? ' (payé)' : ''}</span><span className="text-white font-bold tabular-nums">{fcfa(saved.amount)}</span></p>
          )}
          <p className="text-neutral-300 text-sm mt-3">Prêt au plus tard le <strong className="text-white">{formatPromise(saved.promisedAt)}</strong></p>
        </div>
        <p className="text-sm text-neutral-400 mb-3">Le client suit l'avancement avec ce lien et peut créer son compte pour retrouver ses dépôts dans « {CLIENT_DEPOSITS_LABEL} ».</p>
        <ShareLink order={saved} stationName={stationName} />
        <button type="button" onClick={onClose} className="w-full mt-3 text-neutral-400 hover:text-white py-2 text-sm">Fermer</button>
      </Modal>
    );
  }

  return (
    <Modal title="Nouveau dépôt" onClose={onClose}>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10" role="radiogroup" aria-label="Type de client">
          {[[false, 'Un particulier'], [true, 'Une station Galsen']].map(([v, label]) => (
            <button key={label} type="button" role="radio" aria-checked={isStationClient === v}
              onClick={() => { setIsStationClient(v); if (!v) { setClientStation(null); setForm((f) => ({ ...f, clientName: '', clientPhone: '' })); } }}
              className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors', isStationClient === v ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white')}>
              {label}
            </button>
          ))}
        </div>
        {isStationClient && (
          <div>
            <p className="text-sm text-neutral-400 mb-2">Station qui vous apporte ses {cfg.things} : elle suit le dépôt dans sa rubrique {cfg.nav}, et ce qu'elle vous paie s'ajoute à ses dépenses.</p>
            <StationPicker myStationId={stationId} value={clientStation} onChange={pickStation} />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="cp-name" className="block text-sm font-medium text-neutral-400 mb-1">Nom du client</label>
            <input id="cp-name" className={inputCls} value={form.clientName} onChange={(e) => set('clientName', e.target.value)} placeholder="Ex : Awa Diop" autoComplete="off" required />
          </div>
          <div>
            <label htmlFor="cp-phone" className="block text-sm font-medium text-neutral-400 mb-1">WhatsApp du client</label>
            <input id="cp-phone" className={inputCls} type="tel" inputMode="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} placeholder="77 123 45 67" autoComplete="off" />
          </div>
        </div>

        <PiecesEditor pieces={pieces} onChange={setPieces} />

        <fieldset>
          <legend className="block text-sm font-medium text-neutral-400 mb-2">Prêt sous</legend>
          <div className="flex flex-wrap gap-2">
            {CARPET_DELAYS.map((h) => (
              <button key={h} type="button" onClick={() => setDelay(h)} aria-pressed={delay === h}
                className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors', delay === h ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
                {delayLabel(h)}
              </button>
            ))}
            <button type="button" onClick={() => { setDelay('custom'); if (!customDate) setCustomDate(toLocalInput(promiseFromDelay(DEFAULT_CARPET_DELAY))); }} aria-pressed={delay === 'custom'}
              className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors', delay === 'custom' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
              Autre date
            </button>
          </div>
          {delay === 'custom' && (
            <input type="datetime-local" className={cn(inputCls, 'mt-2')} value={customDate} min={toLocalInput(new Date())} onChange={(e) => setCustomDate(e.target.value)} aria-label="Date et heure promises" />
          )}
          {promise && !Number.isNaN(promise.getTime()) && (
            <p className="text-sm text-neutral-400 mt-2">Annoncé au client : prêt au plus tard le <span className="text-white font-medium">{formatPromise(promise)}</span>.</p>
          )}
        </fieldset>

        <div className="rounded-xl border border-white/10 p-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-blue-500" checked={form.paidNow} onChange={(e) => set('paidNow', e.target.checked)} />
            <span className="text-white text-sm font-medium">Le client paie maintenant{total > 0 ? ` (${fcfa(total)})` : ''}</span>
          </label>
          {form.paidNow && (
            <div className="flex flex-wrap gap-2 mt-3">
              {METHODS.map((m) => (
                <button key={m} type="button" onClick={() => set('method', m)} aria-pressed={form.method === m}
                  className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors', form.method === m ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
                  {m}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Enregistrement…' : `Enregistrer le dépôt${pieces.length ? ` (${unitCount(pieces.length, cfg)}${total ? `, ${fcfa(total)}` : ''})` : ''}`}
        </button>
      </form>
    </Modal>
  );
}

function PayModal({ order, onClose, onDone }) {
  const cfg = useActivity();
  const [amount, setAmount] = useState(order.amount ? String(order.amount) : '');
  const [method, setMethod] = useState('Espèces');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!(parseInt(amount, 10) > 0)) { setError('Indiquez le montant.'); return; }
    setSaving(true);
    try { await recordCarpetPayment(order.id, method, amount); onDone(); onClose(); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Encaisser le ticket n° ${order.ticketNo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-400">{order.clientName} · {orderSummary(order)}</p>
        <div>
          <label htmlFor="pay-amount" className="block text-sm font-medium text-neutral-400 mb-1">Montant (FCFA)</label>
          <input id="pay-amount" className={inputCls} type="number" min="0" step="100" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <div className="flex flex-wrap gap-2">
          {METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} aria-pressed={method === m}
              className={cn('px-3 py-2 rounded-lg text-sm border transition-colors', method === m ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500">La recette apparaît dans Transactions et en Comptabilité, rubrique {cfg.service}.</p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Encaissement…' : `Encaisser ${parseInt(amount, 10) > 0 ? fcfa(amount) : ''}`}
        </button>
      </form>
    </Modal>
  );
}

function EditModal({ order, onClose, onSaved }) {
  const cfg = useActivity();
  const [promisedAt, setPromisedAt] = useState(toLocalInput(order.promisedAt));
  const [pieces, setPieces] = useState(() => orderToPieces(order));
  const [phone, setPhone] = useState(order.clientPhone || '');
  const [note, setNote] = useState(order.note || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (pieces.length < 1) { setError(`Gardez au moins une ${cfg.unit}.`); setSaving(false); return; }
      onSaved(await updateCarpetOrder(order, { promisedAt: new Date(promisedAt).toISOString(), clientPhone: phone, note, pieces }));
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Modifier le ticket n° ${order.ticketNo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="ed-date" className="block text-sm font-medium text-neutral-400 mb-1">Prêt au plus tard le</label>
          <input id="ed-date" type="datetime-local" className={inputCls} value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} required />
        </div>
        <PiecesEditor pieces={pieces} onChange={setPieces} lockPrices={order.paid} fallbackTotal={order.amount} />
        {order.paid && <p className="text-xs text-neutral-500 -mt-2">Déjà encaissé ({fcfa(order.amount)}) : les prix ne changent plus.</p>}
        <div>
          <label htmlFor="ed-phone" className="block text-sm font-medium text-neutral-400 mb-1">WhatsApp du client</label>
          <input id="ed-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label htmlFor="ed-note" className="block text-sm font-medium text-neutral-400 mb-1">Note interne du dépôt</label>
          <input id="ed-note" className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </form>
    </Modal>
  );
}

function OrderRow({ order, partnerOrder, onAdvance, onBack, onCancel, onPay, onEdit, onShare, onOutsource, onTakeBack, busy }) {
  const cfg = useActivity();
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const status = CARPET_STATUS[order.status] || CARPET_STATUS.depose;
  const late = isLateCarpet(order);
  const open = isOpenCarpet(order);
  const next = NEXT_STATUS[order.status];
  return (
    <div className="p-4 sm:p-5 border-b border-white/5 last:border-0">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="w-16 shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Ticket</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-tight">{order.ticketNo}</p>
        </div>
        <div className="flex-1 min-w-[180px]">
          <p className="font-bold text-white truncate">{order.clientName}</p>
          {order.fromStationId && <p className="text-[11px] text-blue-300 flex items-center gap-1"><Building2 className="w-3 h-3" /> Station partenaire</p>}
          <button type="button" onClick={() => setDetails((d) => !d)} aria-expanded={details}
            className="text-neutral-400 hover:text-white text-sm inline-flex items-center gap-1 text-left">
            {orderSummary(order)} <ChevronDown className={cn('w-3.5 h-3.5 shrink-0 transition-transform', details && 'rotate-180')} />
          </button>
          {details && <div className="mt-2 max-w-sm"><PieceList order={order} showNotes /></div>}
          {order.clientPhone && <p className="text-neutral-500 text-xs mt-0.5 tabular-nums">{order.clientPhone}</p>}
          {order.note && <p className="text-neutral-500 text-xs mt-1 italic">« {order.note} »</p>}
          {partnerOrder && partnerOrder.status !== 'annule' && (
            <p className="text-xs mt-1.5 text-blue-300 flex items-center gap-1">
              <Send className="w-3 h-3 shrink-0" /> Confié à {partnerOrder.partner?.name || 'une station partenaire'} · {partnerOrder.status === 'pret' ? 'prêt, à récupérer chez elle' : (CARPET_STATUS[partnerOrder.status]?.label || '').toLowerCase()}
            </p>
          )}
        </div>
        <div className="min-w-[190px]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={cn('text-xs font-medium px-2.5 py-0.5 rounded-md border', TONE[status.tone])}>{status.label}</span>
            {order.clientId && <span className="text-[11px] text-neutral-500" title="Le client suit ce dépôt depuis son espace">suivi par le client</span>}
          </div>
          <Stepper status={order.status} />
          {open && order.status !== 'pret' && (
            <p className={cn('text-xs mt-1.5 flex items-center gap-1', late ? 'text-red-400 font-medium' : 'text-neutral-400')}>
              <Clock className="w-3.5 h-3.5" /> Promis {formatPromise(order.promisedAt)} · {timeLeftLabel(order.promisedAt)}
            </p>
          )}
          {order.status === 'pret' && order.readyAt && <p className="text-xs mt-1.5 text-emerald-400">Prêt depuis le {formatPromise(order.readyAt)}</p>}
          {order.status === 'recupere' && order.pickedUpAt && <p className="text-xs mt-1.5 text-neutral-500">Récupéré le {formatPromise(order.pickedUpAt)}</p>}
        </div>
        <div className="sm:text-right min-w-[110px]">
          <p className="text-white font-bold tabular-nums">{order.amount ? fcfa(order.amount) : '—'}</p>
          <p className={cn('text-xs mt-0.5', order.paid ? 'text-emerald-400' : 'text-amber-400')}>{order.paid ? `Payé (${order.paymentMethod || 'Espèces'})` : order.status === 'annule' ? 'Non encaissé' : 'À encaisser'}</p>
        </div>
      </div>

      {order.status !== 'annule' && (
        <div className="flex flex-wrap items-center gap-2 mt-3 sm:pl-[84px]">
          {next && (
            <button type="button" onClick={() => onAdvance(order, next)} disabled={busy}
              className={cn('inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-60',
                next === 'pret' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white')}>
              <Check className="w-4 h-4" /> {NEXT_ACTION_LABEL[order.status]}
            </button>
          )}
          {!order.paid && (
            <button type="button" onClick={() => onPay(order)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors">
              <Coins className="w-4 h-4 text-amber-400" /> Encaisser
            </button>
          )}
          {open && (
            <button type="button" onClick={() => onShare(order)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors">
              <MessageCircle className="w-4 h-4 text-emerald-400" /> {order.status === 'pret' ? 'Prévenir' : 'Lien de suivi'}
            </button>
          )}
          <div className="relative">
            <button type="button" onClick={() => setMenu((m) => !m)} aria-expanded={menu} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-neutral-400 hover:text-white hover:bg-white/5 transition-colors">
              Plus <ChevronDown className="w-4 h-4" />
            </button>
            {menu && (
              <>
                <button type="button" aria-label="Fermer le menu" className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} />
                <div className="absolute z-20 mt-1 left-0 w-56 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl py-1">
                  <button type="button" onClick={() => { setMenu(false); onEdit(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Pencil className="w-4 h-4" /> Modifier {cfg.units}, prix, délai</button>
                  {PREV_STATUS[order.status] && (
                    <button type="button" onClick={() => { setMenu(false); onBack(order, PREV_STATUS[order.status]); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Undo2 className="w-4 h-4" /> Revenir à « {CARPET_STATUS[PREV_STATUS[order.status]].label} »</button>
                  )}
                  {['depose', 'lavage', 'sechage'].includes(order.status) && !order.fromStationId && (!partnerOrder || partnerOrder.status === 'annule') && (
                    <button type="button" onClick={() => { setMenu(false); onOutsource(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Send className="w-4 h-4" /> Confier à une autre station</button>
                  )}
                  {partnerOrder && partnerOrder.status === 'depose' && (
                    <button type="button" onClick={() => { setMenu(false); onTakeBack(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Undo2 className="w-4 h-4" /> Reprendre chez {partnerOrder.partner?.name || 'la station'}</button>
                  )}
                  {open && !order.paid && (
                    <button type="button" onClick={() => { setMenu(false); onCancel(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/10"><Ban className="w-4 h-4" /> Annuler le dépôt</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { id: 'cours', label: 'En cours' },
  { id: 'prets', label: 'Prêts' },
  { id: 'partenaires', label: 'Chez un partenaire' },
  { id: 'historique', label: 'Historique' },
];

export default function Carpets({ activity = 'tapis' }) {
  const cfg = activityConfig(activity);
  const Icon = cfg.key === 'chaussures' ? Footprints : Layers;
  useDocumentTitle(cfg.nav);
  const { stationProfile, transactions } = useAppState();
  const { stationId, orders, sent, loaded, error, reload, upsertLocal } = useStationCarpets(cfg.key);
  const [outsourcing, setOutsourcing] = useState(null);
  const sentById = useMemo(() => new Map(sent.map((o) => [o.id, o])), [sent]);
  const ownById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders]);
  const sentOpen = sent.filter(isOpenCarpet);
  const stationName = stationProfile?.name || '';
  const [tab, setTab] = useState('cours');
  const [query, setQuery] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [paying, setPaying] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');

  const now = new Date();
  const inProgress = orders.filter((o) => ['depose', 'lavage', 'sechage'].includes(o.status));
  const ready = orders.filter((o) => o.status === 'pret');
  const late = inProgress.filter((o) => isLateCarpet(o, now));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenue = (transactions || []).filter((t) => t.service === cfg.service && new Date(t.createdAt) >= monthStart).reduce((s, t) => s + (parseInt(t.amount, 10) || 0), 0);
  const toCollect = orders.filter((o) => isOpenCarpet(o) && !o.paid).reduce((s, o) => s + (o.amount || 0), 0);

  const list = useMemo(() => {
    const base = tab === 'cours'
      ? [...inProgress].sort((a, b) => new Date(a.promisedAt) - new Date(b.promisedAt))
      : tab === 'prets' ? ready : orders.filter((o) => !isOpenCarpet(o));
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((o) => String(o.ticketNo) === q.replace(/^n°\s*/, '') || (o.clientName || '').toLowerCase().includes(q) || (o.clientPhone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')));
  }, [tab, orders, query]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = { cours: inProgress.length, prets: ready.length, partenaires: sentOpen.length, historique: orders.length - inProgress.length - ready.length };
  const sentList = [...sentOpen, ...sent.filter((o) => !isOpenCarpet(o))];

  const takeBack = async (ownOrder) => {
    if (!window.confirm(`Reprendre le ticket n° ${ownOrder.ticketNo} ? La station partenaire ne l'aura plus dans sa liste.`)) return;
    setBusyId(ownOrder.id);
    setActionError('');
    try { await cancelOutsource(ownOrder.id); await reload(); } catch (err) { setActionError(err.message); } finally { setBusyId(null); }
  };

  const changeStatus = async (order, status) => {
    if (status === 'recupere' && !order.paid && order.amount > 0 && !window.confirm(`Ticket n° ${order.ticketNo} pas encore encaissé (${fcfa(order.amount)}). Le marquer quand même comme remis ?`)) return;
    setBusyId(order.id);
    setActionError('');
    try {
      const updated = await setCarpetStatus(order.id, status);
      upsertLocal(updated);
      if (status === 'pret') setSharing(updated); // proposer tout de suite de prévenir le client
    } catch (err) { setActionError(err.message); } finally { setBusyId(null); }
  };
  const cancelOrder = (order) => {
    if (window.confirm(`Annuler le dépôt n° ${order.ticketNo} de ${order.clientName} ?`)) changeStatus(order, 'annule');
  };

  return (
    <ActivityContext.Provider value={cfg}>
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight flex items-center gap-3">
            <Icon className="w-8 h-8 text-blue-400" /> {cfg.title}
          </h1>
          <p className="text-neutral-400 text-base sm:text-lg">{cfg.intro}</p>
        </div>
        <button type="button" onClick={() => setShowNew(true)} className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-bold transition-colors">
          <Plus className="w-5 h-5" /> Nouveau dépôt
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8">
        <Card className="border-white/5 bg-white/[0.02]"><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">En cours</p>
          <p className="text-3xl font-bold text-white tabular-nums">{inProgress.length}</p>
        </CardContent></Card>
        <Card className="border-white/5 bg-white/[0.02]"><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">Prêts à récupérer</p>
          <p className="text-3xl font-bold text-emerald-400 tabular-nums">{ready.length}</p>
        </CardContent></Card>
        <Card className={cn('border-white/5 bg-white/[0.02]', late.length > 0 && 'border-red-500/30 bg-red-500/[0.04]')}><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">En retard</p>
          <p className={cn('text-3xl font-bold tabular-nums', late.length ? 'text-red-400' : 'text-white')}>{late.length}</p>
        </CardContent></Card>
        <Card className="border-white/5 bg-white/[0.02]"><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">Encaissé ce mois</p>
          <p className="text-2xl sm:text-3xl font-bold text-white tabular-nums">{fcfa(monthRevenue)}</p>
          {toCollect > 0 && <p className="text-xs text-amber-400 mt-1">{fcfa(toCollect)} à encaisser</p>}
        </CardContent></Card>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 w-full sm:w-auto overflow-x-auto" role="tablist">
          {TABS.filter((t) => t.id !== 'partenaires' || sent.length > 0).map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn('flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors', tab === t.id ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white')}>
              {t.label} <span className="tabular-nums opacity-70">{counts[t.id]}</span>
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, téléphone ou n° de ticket" aria-label="Rechercher un dépôt"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:border-blue-500" />
        </div>
      </div>

      {(error || actionError) && (
        <p className="mb-4 text-sm text-red-400 flex items-center gap-2" role="alert"><AlertTriangle className="w-4 h-4" /> {actionError || "Les dépôts n'ont pas pu être lus. Rechargez la page."}</p>
      )}

      {!loaded ? (
        <div className="glass-card rounded-2xl h-40 border border-white/5 bg-white/[0.02] animate-pulse" />
      ) : tab === 'partenaires' ? (
        sentList.length === 0 ? (
          <div className="glass-card rounded-2xl p-10 text-center border-dashed border-2 border-white/10">
            <Building2 className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
            <p className="text-neutral-400 text-sm max-w-md mx-auto">Aucun dépôt chez une autre station. Pour en confier un : « Plus », puis « Confier à une autre station ».</p>
          </div>
        ) : (
          <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
            {sentList.map((o) => <SentRow key={o.id} order={o} ownOrder={o.fromOrderId ? ownById.get(o.fromOrderId) : null} onTakeBack={takeBack} busy={busyId === o.fromOrderId} />)}
          </div>
        )
      ) : list.length === 0 ? (
        <div className="glass-card rounded-2xl p-10 text-center border-dashed border-2 border-white/10">
          <Icon className="w-12 h-12 text-neutral-600 mx-auto mb-3" />
          {orders.length === 0 ? (
            <>
              <p className="text-white font-bold mb-1">Aucun dépôt pour l'instant</p>
              <p className="text-neutral-400 text-sm max-w-md mx-auto">{cfg.empty}</p>
              <button type="button" onClick={() => setShowNew(true)} className="mt-5 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-bold transition-colors"><Plus className="w-5 h-5" /> Premier dépôt</button>
            </>
          ) : (
            <p className="text-neutral-400">{query ? 'Aucun dépôt ne correspond à la recherche.' : tab === 'prets' ? 'Aucun dépôt prêt en attente du client.' : tab === 'cours' ? 'Aucun dépôt en cours.' : 'Aucun dépôt terminé.'}</p>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} busy={busyId === o.id} partnerOrder={o.partnerOrderId ? sentById.get(o.partnerOrderId) : null}
              onAdvance={changeStatus} onBack={changeStatus} onCancel={cancelOrder}
              onPay={setPaying} onEdit={setEditing} onShare={setSharing} onOutsource={setOutsourcing} onTakeBack={takeBack} />
          ))}
        </div>
      )}

      {showNew && <NewDepositModal stationId={stationId} stationName={stationName} onClose={() => setShowNew(false)} onSaved={(o) => { upsertLocal(o); setTab('cours'); }} />}
      {outsourcing && <OutsourceModal order={outsourcing} myStationId={stationId} onClose={() => setOutsourcing(null)} onDone={async () => { await reload(); setTab('partenaires'); }} />}
      {paying && <PayModal order={paying} onClose={() => setPaying(null)} onDone={reload} />}
      {editing && <EditModal order={editing} onClose={() => setEditing(null)} onSaved={upsertLocal} />}
      {sharing && (
        <Modal title={sharing.status === 'pret' ? `Ticket n° ${sharing.ticketNo} prêt` : `Lien de suivi · ticket n° ${sharing.ticketNo}`} onClose={() => setSharing(null)}>
          <p className="text-sm text-neutral-400 mb-4">
            {sharing.status === 'pret'
              ? `Prévenez ${sharing.clientName} que son dépôt est prêt. S'il a créé son compte, il le voit déjà dans « ${CLIENT_DEPOSITS_LABEL} ».`
              : `${sharing.clientName} suit l'avancement avec ce lien et peut créer son compte pour être prévenu.`}
          </p>
          <ShareLink order={sharing} stationName={stationName} ready={sharing.status === 'pret'} />
        </Modal>
      )}
    </div>
    </ActivityContext.Provider>
  );
}
