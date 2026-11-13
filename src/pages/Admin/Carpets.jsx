// Rubriques station « Tapis », « Chaussures », « Salon » et « Pressing » (même
// page, prop `activity`) : ce que les clients déposent ou confient. Enregistrer
// un dépôt, le faire avancer, l'encaisser (avance puis solde, transaction du
// service de l'activité en Comptabilité), imprimer le ticket et les
// étiquettes, envoyer au client le lien de suivi sur WhatsApp. Chaque
// activité s'ouvre par son module (Super Admin > Modules). Voir
// add_carpet_cleaning.sql, add_shoe_cleaning.sql et add_salon_pressing.sql.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import {
  Layers, Footprints, Sofa, Shirt, Plus, X, Search, MessageCircle, Link2, Check, Coins, ChevronDown, Undo2, Pencil, Ban, Clock, AlertTriangle, Trash2,
  Building2, Send, Phone, Printer, Tags, Zap, MapPin, Archive,
} from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { useAppState } from '../../hooks/useAppState';
import { useStationCarpets } from '../../hooks/useStationCarpets';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { cn } from '../../lib/utils';
import {
  CARPET_DELAYS, DEFAULT_CARPET_DELAY, NEXT_STATUS, stepsFor, statusInfo, actionLabel,
  isOpenCarpet, isLateCarpet, stepIndex, orderSummary, fcfa, formatPromise, timeLeftLabel, carpetTrackingUrl,
  depositMessage, readyMessage, carpetWhatsAppLink, createCarpetOrder, setCarpetStatus, updateCarpetOrder,
  recordCarpetPayment, activityConfig, unitCount, CLIENT_DEPOSITS_LABEL, newPiece, pieceLines, pieceLabel, piecesTotal, piecesWithoutPrice, orderToPieces,
  loadPartnerStations, stationPlace, outsourceCarpet, cancelOutsource,
  PRESSING_TREATMENTS, DEFAULT_TREATMENT, suggestedPiecePrice, expressRate, expressFeeFor, emptyPriceList, loadPriceList, savePriceList,
  amountDue, daysSinceReady, UNCLAIMED_DAYS,
} from '../../lib/carpets';
import { printDeposit } from '../../lib/depositPrint';
import { whatsappLink } from '../../lib/subscriptionReminders';

const METHODS = ['Espèces', 'Wave', 'Orange Money', 'Carte'];
const PREV_STATUS = { lavage: 'depose', sechage: 'lavage', pret: 'sechage', recupere: 'pret' };
const ICONS = { tapis: Layers, chaussures: Footprints, salon: Sofa, pressing: Shirt };
const inputCls = 'w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-neutral-600 focus:outline-none focus:border-blue-500';
const smallBtn = 'inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-white transition-colors';
const toInt = (v) => parseInt(String(v ?? '').replace(/\s/g, ''), 10) || 0;

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

// Rubrique ouverte : libellés, types de pièces, service, options.
const ActivityContext = createContext(activityConfig('tapis'));
const useActivity = () => useContext(ActivityContext);

// Rendue dans <body> : la page est un contexte d'empilement (relative z-10),
// une fenêtre restée dedans passerait sous le menu et le bandeau d'essai.
function Modal({ title, onClose, children, wide = false }) {
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
        className={cn('bg-neutral-900 border border-white/10 rounded-t-2xl sm:rounded-2xl p-5 sm:p-6 w-full shadow-2xl relative max-h-[92dvh] overflow-y-auto', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}
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
  const cfg = useActivity();
  const steps = stepsFor(cfg.key);
  const idx = stepIndex(status);
  const cancelled = status === 'annule';
  return (
    <ol className="flex items-center gap-1.5" aria-label={`Étape : ${statusInfo(cfg.key, status).label}`}>
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span
            title={s.label}
            className={cn('h-1.5 w-7 rounded-full', cancelled ? 'bg-white/10' : i <= idx ? (idx === steps.length - 1 ? 'bg-emerald-400' : 'bg-blue-400') : 'bg-white/10')}
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

// Ticket et étiquettes à imprimer.
function PrintButtons({ order, stationName }) {
  const cfg = useActivity();
  const [blocked, setBlocked] = useState(false);
  const print = (what) => setBlocked(!printDeposit(order, { stationName, what }));
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => print('ticket')} className={smallBtn}><Printer className="w-4 h-4" /> Imprimer le ticket</button>
        {cfg.labels && <button type="button" onClick={() => print('labels')} className={smallBtn}><Tags className="w-4 h-4" /> Étiquettes ({pieceLines(order.items).length})</button>}
      </div>
      {blocked && <p className="text-xs text-amber-400 mt-2">L'impression n'a pas pu démarrer. Réessayez depuis le menu « Plus » du dépôt.</p>}
    </div>
  );
}

// Pièces une par une : chaque type touché ajoute une pièce avec sa taille, son
// prix (proposé par les tarifs) et sa note interne ; pressing : un traitement
// par article, le prix suit. Le total est la somme des prix, plus les frais.
function PiecesEditor({ pieces, onChange, lockPrices = false, fallbackTotal = 0, priceList, extras = [] }) {
  const cfg = useActivity();
  const [focusId, setFocusId] = useState(null);
  const add = (kind) => {
    const service = cfg.treatments ? DEFAULT_TREATMENT : '';
    const piece = newPiece(kind, { service, price: suggestedPiecePrice(priceList, kind, service) });
    onChange([...pieces, piece]);
    setFocusId(piece.id);
  };
  const patch = (id, field, value) => onChange(pieces.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  const setTreatment = (p, service) => {
    const price = lockPrices ? p.price : (suggestedPiecePrice(priceList, p.kind, service) || p.price);
    onChange(pieces.map((x) => (x.id === p.id ? { ...x, service, price } : x)));
  };
  const remove = (id) => onChange(pieces.filter((p) => p.id !== id));
  const total = piecesTotal(pieces);
  const missing = piecesWithoutPrice(pieces);
  const extraSum = extras.reduce((s, e) => s + (e.amount || 0), 0);
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
                <button type="button" onClick={() => remove(p.id)} aria-label={`Retirer : ${cfg.unit} ${i + 1}`} title="Retirer"
                  className="w-9 h-9 rounded-lg text-neutral-400 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className={cn('grid gap-2', cfg.treatments ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2')}>
                {cfg.treatments && (
                  <div>
                    <label htmlFor={`trt-${p.id}`} className="block text-xs text-neutral-500 mb-1">Traitement</label>
                    <select id={`trt-${p.id}`} className={inputCls} value={p.service || DEFAULT_TREATMENT} onChange={(e) => setTreatment(p, e.target.value)}>
                      {PRESSING_TREATMENTS.map((t) => <option key={t.key} value={t.label}>{t.label}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor={`size-${p.id}`} className="block text-xs text-neutral-500 mb-1">{cfg.sizeLabel}</label>
                  <input id={`size-${p.id}`} className={inputCls} value={p.size} onChange={(e) => patch(p.id, 'size', e.target.value)} placeholder={cfg.sizePlaceholder} autoComplete="off"
                    autoFocus={focusId === p.id} />
                </div>
                <div>
                  <label htmlFor={`price-${p.id}`} className="block text-xs text-neutral-500 mb-1">Prix (FCFA)</label>
                  <input id={`price-${p.id}`} className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="50" inputMode="numeric" value={p.price}
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
        <div className="mt-3 px-1 space-y-1">
          {extras.filter((e) => e.amount > 0).map((e) => (
            <p key={e.label} className="flex justify-between text-sm text-neutral-400"><span>{e.label}</span><span className="tabular-nums">{fcfa(e.amount)}</span></p>
          ))}
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-neutral-400">
              Prix total{missing > 0 ? <span className="text-amber-400"> · {unitCount(missing, cfg)} sans prix</span> : null}
            </span>
            <span className="text-xl font-bold text-white tabular-nums">{fcfa((total || fallbackTotal) + (total ? extraSum : 0))}</span>
          </div>
        </div>
      )}
      {!total && fallbackTotal > 0 && (
        <p className="text-xs text-neutral-500 mt-1 px-1">Total saisi avant le détail par pièce. Il reste tel quel tant qu'aucun prix de pièce n'est indiqué.</p>
      )}
    </fieldset>
  );
}

function PieceList({ order, showNotes = false }) {
  const cfg = useActivity();
  const lines = pieceLines(order.items);
  return (
    <ul className="space-y-1">
      {lines.map((p, i) => (
        <li key={p.id} className="text-sm">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-neutral-300 min-w-0">{cfg.labels && <span className="text-neutral-500 tabular-nums mr-1.5">{order.ticketNo}-{i + 1}</span>}{pieceLabel(p)}</span>
            <span className="text-neutral-400 tabular-nums shrink-0">{p.price ? fcfa(p.price) : order.amount > 0 ? '' : 'prix à fixer'}</span>
          </span>
          {showNotes && order.pieceNotes?.[p.id] && <span className="block text-xs text-neutral-500 italic">« {order.pieceNotes[p.id]} »</span>}
        </li>
      ))}
      {order.expressFee > 0 && <li className="text-sm flex justify-between gap-3 text-neutral-400"><span>Express</span><span className="tabular-nums">{fcfa(order.expressFee)}</span></li>}
      {order.travelFee > 0 && <li className="text-sm flex justify-between gap-3 text-neutral-400"><span>{cfg.feeLabel}</span><span className="tabular-nums">{fcfa(order.travelFee)}</span></li>}
    </ul>
  );
}

// Liste des stations Galsen qui ont la même activité (sauf la sienne), avec recherche.
function StationPicker({ myStationId, value, onChange }) {
  const cfg = useActivity();
  const [stations, setStations] = useState(null);
  const [q, setQ] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadPartnerStations(myStationId, cfg.key).then((list) => { if (!cancelled) setStations(list); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [myStationId, cfg.key]);
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
          <p className="px-4 py-4 text-sm text-neutral-500">Aucune autre station ne propose cette activité pour l'instant.</p>
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
    if (!partner) { setError('Choisissez la station partenaire.'); return; }
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
  const status = statusInfo(cfg.key, order.status);
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
          {call && <a href={call} className={smallBtn}><Phone className="w-4 h-4" /> Appeler</a>}
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={smallBtn}><MessageCircle className="w-4 h-4 text-emerald-400" /> WhatsApp</a>}
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

// Choix à deux ou trois boutons (lieu, paiement).
function Segmented({ value, onChange, options, label }) {
  return (
    <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
          className={cn('flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors', value === v ? 'bg-blue-600 text-white' : 'text-neutral-400 hover:text-white')}>
          {text}
        </button>
      ))}
    </div>
  );
}

function MethodPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {METHODS.map((m) => (
        <button key={m} type="button" onClick={() => onChange(m)} aria-pressed={value === m}
          className={cn('px-3 py-1.5 rounded-lg text-sm border transition-colors', value === m ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
          {m}
        </button>
      ))}
    </div>
  );
}

function NewDepositModal({ stationId, stationName, onClose, onSaved, priceList, knownClients }) {
  const cfg = useActivity();
  const [form, setForm] = useState({
    clientName: '', clientPhone: '', payMode: 'none', advance: '', method: 'Espèces',
    express: false, place: 'station', address: '', travelFee: priceList?.options?.travelFee ? String(priceList.options.travelFee) : '',
  });
  const [pieces, setPieces] = useState([]);
  // Client = une autre station Galsen : elle suivra le dépôt et son paiement sera une dépense chez elle.
  const [clientStation, setClientStation] = useState(null);
  const [isStationClient, setIsStationClient] = useState(false);
  const pickStation = (st) => { setClientStation(st); setForm((f) => ({ ...f, clientName: st.name, clientPhone: st.owner_phone || '' })); };
  const [delay, setDelay] = useState(cfg.defaultDelay || DEFAULT_CARPET_DELAY);
  const [customDate, setCustomDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const home = form.place === 'domicile';
  const homeVisit = home && cfg.key === 'salon'; // rendez-vous chez le client : une date, pas un délai
  const piecesSum = piecesTotal(pieces);
  const expressFee = cfg.express && form.express ? expressFeeFor(piecesSum, expressRate(priceList)) : 0;
  const travelFee = home ? toInt(form.travelFee) : 0;
  const total = piecesSum + expressFee + travelFee;
  const promise = delay === 'custom' ? (customDate ? new Date(customDate) : null) : promiseFromDelay(delay);

  // Client déjà venu : son numéro se remplit tout seul.
  const onName = (v) => {
    setForm((f) => {
      const known = knownClients.find((c) => c.name.toLowerCase() === v.trim().toLowerCase());
      return { ...f, clientName: v, clientPhone: f.clientPhone || known?.phone || '', address: f.address || known?.address || '' };
    });
  };
  const setPlace = (v) => {
    set('place', v);
    if (v === 'domicile' && cfg.key === 'salon') { setDelay('custom'); if (!customDate) setCustomDate(toLocalInput(promiseFromDelay(24))); }
  };
  const setExpress = (on) => { set('express', on); if (on) setDelay(24); };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isStationClient && !clientStation) { setError('Choisissez la station cliente.'); return; }
    if (!form.clientName.trim()) { setError('Indiquez le nom du client.'); return; }
    if (pieces.length < 1) { setError(`Ajoutez au moins une ${cfg.unit === 'article' ? 'pièce' : cfg.unit}.`); return; }
    if (home && !form.address.trim()) { setError('Indiquez l’adresse du client.'); return; }
    if (!promise || Number.isNaN(promise.getTime())) { setError(homeVisit ? 'Choisissez la date de l’intervention.' : 'Choisissez la date à laquelle ce sera prêt.'); return; }
    if (form.payMode === 'full' && !(total > 0)) { setError(`Indiquez les prix pour encaisser maintenant.`); return; }
    const advance = toInt(form.advance);
    if (form.payMode === 'advance' && !(advance > 0)) { setError('Indiquez le montant de l’avance.'); return; }
    setSaving(true);
    try {
      let order = await createCarpetOrder(stationId, {
        clientName: form.clientName, clientPhone: form.clientPhone,
        pieces, promisedAt: promise.toISOString(),
        fromStationId: isStationClient ? clientStation?.id : null,
        activity: cfg.key,
        express: cfg.express && form.express, expressFee,
        place: form.place, address: form.address, travelFee,
      });
      if (form.payMode === 'full' || (form.payMode === 'advance' && total > 0 && advance >= total)) {
        await recordCarpetPayment(order.id, form.method, total);
        order = { ...order, paid: true, amountPaid: total, paymentMethod: form.method };
      } else if (form.payMode === 'advance') {
        await recordCarpetPayment(order.id, form.method, advance, true);
        order = { ...order, amountPaid: advance, paymentMethod: form.method };
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
          <p className="text-4xl font-bold text-white tabular-nums flex items-center gap-3">n° {saved.ticketNo}{saved.express && <span className="text-xs font-bold text-amber-300 border border-amber-400/40 rounded px-1.5 py-0.5">EXPRESS</span>}</p>
          <p className="text-white mt-3 mb-2 font-medium">{saved.clientName}</p>
          <PieceList order={saved} />
          {saved.amount > 0 && (
            <p className="flex justify-between text-sm mt-2 pt-2 border-t border-white/10"><span className="text-neutral-400">Total{saved.paid ? ' (payé)' : ''}</span><span className="text-white font-bold tabular-nums">{fcfa(saved.amount)}</span></p>
          )}
          {saved.amountPaid > 0 && !saved.paid && (
            <p className="flex justify-between text-sm mt-1"><span className="text-neutral-400">Avance {fcfa(saved.amountPaid)}</span><span className="text-amber-300 font-bold tabular-nums">reste {fcfa(amountDue(saved))}</span></p>
          )}
          <p className="text-neutral-300 text-sm mt-3">{saved.place === 'domicile' && cfg.key === 'salon' ? 'Intervention le' : 'Prêt au plus tard le'} <strong className="text-white">{formatPromise(saved.promisedAt)}</strong></p>
        </div>
        <div className="mb-4"><PrintButtons order={saved} stationName={stationName} /></div>
        <p className="text-sm text-neutral-400 mb-3">Le client suit l'avancement avec ce lien et peut créer son compte pour retrouver ses dépôts dans « {CLIENT_DEPOSITS_LABEL} ».</p>
        <ShareLink order={saved} stationName={stationName} />
        <button type="button" onClick={onClose} className="w-full mt-3 text-neutral-400 hover:text-white py-2 text-sm">Fermer</button>
      </Modal>
    );
  }

  return (
    <Modal title="Nouveau dépôt" onClose={onClose} wide={cfg.key === 'pressing'}>
      <form onSubmit={submit} className="space-y-5">
        <Segmented label="Type de client" value={isStationClient} options={[[false, 'Un particulier'], [true, 'Une station Galsen']]}
          onChange={(v) => { setIsStationClient(v); if (!v) { setClientStation(null); setForm((f) => ({ ...f, clientName: '', clientPhone: '' })); } }} />
        {isStationClient && (
          <div>
            <p className="text-sm text-neutral-400 mb-2">Station qui vous apporte ses {cfg.things} : elle suit le dépôt dans sa rubrique {cfg.nav}, et ce qu'elle vous paie s'ajoute à ses dépenses.</p>
            <StationPicker myStationId={stationId} value={clientStation} onChange={pickStation} />
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="cp-name" className="block text-sm font-medium text-neutral-400 mb-1">Nom du client</label>
            <input id="cp-name" className={inputCls} value={form.clientName} onChange={(e) => onName(e.target.value)} placeholder="Ex : Awa Diop" autoComplete="off" list="known-clients" required />
            <datalist id="known-clients">
              {knownClients.slice(0, 200).map((c) => <option key={`${c.name}-${c.phone}`} value={c.name}>{c.phone}</option>)}
            </datalist>
          </div>
          <div>
            <label htmlFor="cp-phone" className="block text-sm font-medium text-neutral-400 mb-1">WhatsApp du client</label>
            <input id="cp-phone" className={inputCls} type="tel" inputMode="tel" value={form.clientPhone} onChange={(e) => set('clientPhone', e.target.value)} placeholder="77 123 45 67" autoComplete="off" />
          </div>
        </div>

        {cfg.places && !isStationClient && (
          <div className="space-y-3">
            <Segmented label="Lieu" value={form.place} options={cfg.places} onChange={setPlace} />
            {home && (
              <div className="grid sm:grid-cols-[1fr_10rem] gap-3">
                <div>
                  <label htmlFor="cp-addr" className="block text-sm font-medium text-neutral-400 mb-1">Adresse du client</label>
                  <input id="cp-addr" className={inputCls} value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Quartier, rue, repère" autoComplete="off" />
                </div>
                <div>
                  <label htmlFor="cp-fee" className="block text-sm font-medium text-neutral-400 mb-1">{cfg.feeLabel}</label>
                  <input id="cp-fee" className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="100" inputMode="numeric" value={form.travelFee} onChange={(e) => set('travelFee', e.target.value)} placeholder="0" />
                </div>
              </div>
            )}
          </div>
        )}

        <PiecesEditor pieces={pieces} onChange={setPieces} priceList={priceList}
          extras={[{ label: `Express (+${expressRate(priceList)} %)`, amount: expressFee }, { label: cfg.feeLabel || 'Frais', amount: travelFee }]} />

        {cfg.express && (
          <label className="flex items-center gap-3 rounded-xl border border-white/10 p-4 cursor-pointer">
            <input type="checkbox" className="w-5 h-5 accent-amber-500" checked={form.express} onChange={(e) => setExpress(e.target.checked)} />
            <span className="text-sm">
              <span className="text-white font-medium flex items-center gap-1.5"><Zap className="w-4 h-4 text-amber-400" /> Express</span>
              <span className="text-neutral-400">Prêt sous 24 h, supplément de {expressRate(priceList)} %{expressFee ? ` (${fcfa(expressFee)})` : ''}.</span>
            </span>
          </label>
        )}

        <fieldset>
          <legend className="block text-sm font-medium text-neutral-400 mb-2">{homeVisit ? 'Date de l’intervention' : 'Prêt sous'}</legend>
          {!homeVisit && (
            <div className="flex flex-wrap gap-2">
              {CARPET_DELAYS.map((h) => (
                <button key={h} type="button" onClick={() => setDelay(h)} aria-pressed={delay === h}
                  className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors', delay === h ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
                  {delayLabel(h)}
                </button>
              ))}
              <button type="button" onClick={() => { setDelay('custom'); if (!customDate) setCustomDate(toLocalInput(promiseFromDelay(cfg.defaultDelay || DEFAULT_CARPET_DELAY))); }} aria-pressed={delay === 'custom'}
                className={cn('px-4 py-2 rounded-lg text-sm font-medium border transition-colors', delay === 'custom' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-white/5 border-white/10 text-neutral-300 hover:bg-white/10')}>
                Autre date
              </button>
            </div>
          )}
          {delay === 'custom' && (
            <input type="datetime-local" className={cn(inputCls, !homeVisit && 'mt-2')} value={customDate} min={toLocalInput(new Date())} onChange={(e) => setCustomDate(e.target.value)} aria-label="Date et heure" />
          )}
          {promise && !Number.isNaN(promise.getTime()) && (
            <p className="text-sm text-neutral-400 mt-2">Annoncé au client : {homeVisit ? 'intervention le' : 'prêt au plus tard le'} <span className="text-white font-medium">{formatPromise(promise)}</span>.</p>
          )}
        </fieldset>

        <div className="rounded-xl border border-white/10 p-4 space-y-3">
          <p className="text-sm font-medium text-neutral-400">Paiement maintenant</p>
          <Segmented label="Paiement maintenant" value={form.payMode} onChange={(v) => set('payMode', v)}
            options={[['none', 'Au retrait'], ['advance', 'Une avance'], ['full', total > 0 ? `Tout (${fcfa(total)})` : 'Tout']]} />
          {form.payMode === 'advance' && (
            <div>
              <label htmlFor="cp-adv" className="block text-xs text-neutral-500 mb-1">Montant de l'avance (FCFA)</label>
              <input id="cp-adv" className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="100" inputMode="numeric" value={form.advance} onChange={(e) => set('advance', e.target.value)}
                placeholder={total > 0 ? String(Math.round(total / 2 / 100) * 100) : '2000'} />
              {total > 0 && toInt(form.advance) > 0 && toInt(form.advance) < total && <p className="text-xs text-neutral-400 mt-1">Reste à payer au retrait : {fcfa(total - toInt(form.advance))}</p>}
            </div>
          )}
          {form.payMode !== 'none' && <MethodPicker value={form.method} onChange={(m) => set('method', m)} />}
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
  const due = amountDue(order);
  const [mode, setMode] = useState('solde');
  const [amount, setAmount] = useState(due ? String(due) : '');
  const [method, setMethod] = useState('Espèces');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const advance = mode === 'avance';
  const submit = async (e) => {
    e.preventDefault();
    if (!(toInt(amount) > 0)) { setError('Indiquez le montant.'); return; }
    setSaving(true);
    try { await recordCarpetPayment(order.id, method, amount, advance); onDone(); onClose(); } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Encaisser le ticket n° ${order.ticketNo}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-400">{order.clientName} · {orderSummary(order)}</p>
        {order.amountPaid > 0 && (
          <p className="text-sm rounded-xl bg-white/5 px-4 py-3 flex justify-between"><span className="text-neutral-400">Total {fcfa(order.amount)} · avance {fcfa(order.amountPaid)}</span><span className="text-white font-bold">reste {fcfa(due)}</span></p>
        )}
        <Segmented label="Type d'encaissement" value={mode} onChange={(v) => { setMode(v); setAmount(v === 'solde' && due ? String(due) : ''); }}
          options={[['solde', 'Solde (tout régler)'], ['avance', 'Une avance']]} />
        <div>
          <label htmlFor="pay-amount" className="block text-sm font-medium text-neutral-400 mb-1">Montant (FCFA)</label>
          <input id="pay-amount" className={inputCls} type="number" min="0" step="50" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
        </div>
        <MethodPicker value={method} onChange={setMethod} />
        <p className="text-xs text-neutral-500">
          {advance
            ? 'Le dépôt reste « à encaisser » pour le reste.'
            : `Le dépôt passe « payé ». Montant final : ${fcfa((order.amountPaid || 0) + toInt(amount))}.`}
          {' '}La recette apparaît dans Transactions et en Comptabilité, rubrique {cfg.service}.
        </p>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Encaissement…' : `Encaisser ${toInt(amount) > 0 ? fcfa(amount) : ''}`}
        </button>
      </form>
    </Modal>
  );
}

function EditModal({ order, onClose, onSaved, priceList }) {
  const cfg = useActivity();
  const [promisedAt, setPromisedAt] = useState(toLocalInput(order.promisedAt));
  const [pieces, setPieces] = useState(() => orderToPieces(order));
  const [phone, setPhone] = useState(order.clientPhone || '');
  const [note, setNote] = useState(order.note || '');
  const [rack, setRack] = useState(order.rack || '');
  const [address, setAddress] = useState(order.address || '');
  const [travelFee, setTravelFee] = useState(order.travelFee ? String(order.travelFee) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const home = order.place === 'domicile';
  const locked = order.paid;
  const expressFee = order.express && !locked ? expressFeeFor(piecesTotal(pieces), expressRate(priceList)) : order.expressFee;
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (pieces.length < 1) { setError(`Gardez au moins une pièce.`); setSaving(false); return; }
      const patch = { promisedAt: new Date(promisedAt).toISOString(), clientPhone: phone, note, pieces };
      if (cfg.racks) patch.rack = rack;
      if (home) { patch.address = address; if (!locked) patch.travelFee = toInt(travelFee); }
      if (order.express && !locked) patch.expressFee = expressFee;
      onSaved(await updateCarpetOrder(order, patch));
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Modifier le ticket n° ${order.ticketNo}`} onClose={onClose} wide={cfg.key === 'pressing'}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="ed-date" className="block text-sm font-medium text-neutral-400 mb-1">{home && cfg.key === 'salon' ? 'Intervention le' : 'Prêt au plus tard le'}</label>
          <input id="ed-date" type="datetime-local" className={inputCls} value={promisedAt} onChange={(e) => setPromisedAt(e.target.value)} required />
        </div>
        <PiecesEditor pieces={pieces} onChange={setPieces} lockPrices={locked} fallbackTotal={order.amount} priceList={priceList}
          extras={[{ label: 'Express', amount: expressFee }, { label: cfg.feeLabel || 'Frais', amount: home ? toInt(travelFee) : 0 }]} />
        {locked && <p className="text-xs text-neutral-500 -mt-2">Déjà encaissé ({fcfa(order.amount)}) : les prix ne changent plus.</p>}
        {home && (
          <div className="grid sm:grid-cols-[1fr_10rem] gap-3">
            <div>
              <label htmlFor="ed-addr" className="block text-sm font-medium text-neutral-400 mb-1">Adresse du client</label>
              <input id="ed-addr" className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label htmlFor="ed-fee" className="block text-sm font-medium text-neutral-400 mb-1">{cfg.feeLabel}</label>
              <input id="ed-fee" className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="100" value={travelFee} onChange={(e) => setTravelFee(e.target.value)} disabled={locked} />
            </div>
          </div>
        )}
        {cfg.racks && (
          <div>
            <label htmlFor="ed-rack" className="block text-sm font-medium text-neutral-400 mb-1">Emplacement (portant, casier)</label>
            <input id="ed-rack" className={inputCls} value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Portant B, 12" />
          </div>
        )}
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

// Tarifs de la station pour l'activité : prix de base par type de pièce
// (proposés au dépôt), et pour le pressing coefficients de traitement et
// supplément express ; frais de déplacement / livraison par défaut.
function PriceListModal({ stationId, priceList, onClose, onSaved }) {
  const cfg = useActivity();
  const [prices, setPrices] = useState(() => Object.fromEntries(cfg.kinds.filter((k) => k !== 'Autre').map((k) => [k, priceList.prices?.[k] ? String(priceList.prices[k]) : ''])));
  const [factors, setFactors] = useState(() => Object.fromEntries(PRESSING_TREATMENTS.map((t) => [t.key, String(priceList.options?.factors?.[t.key] ?? t.factor)])));
  const [rate, setRate] = useState(String(expressRate(priceList)));
  const [travelFee, setTravelFee] = useState(priceList.options?.travelFee ? String(priceList.options.travelFee) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fillSuggested = () => setPrices((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || String(cfg.suggested?.[k] || '')])));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const options = { ...(priceList.options || {}) };
      if (cfg.treatments) options.factors = Object.fromEntries(Object.entries(factors).map(([k, v]) => [k, Number(String(v).replace(',', '.')) || 1]));
      if (cfg.express) options.expressRate = Math.max(0, toInt(rate));
      if (cfg.places) options.travelFee = toInt(travelFee);
      onSaved(await savePriceList(stationId, cfg.key, { prices, options }));
      onClose();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  };
  return (
    <Modal title={`Tarifs · ${cfg.nav}`} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-neutral-400 max-w-md">Prix proposés au dépôt{cfg.treatments ? ' pour « Lavage + repassage »' : ''}. Vous pouvez toujours les changer pièce par pièce.</p>
          <button type="button" onClick={fillSuggested} className={smallBtn}>Remplir les cases vides</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
          {Object.keys(prices).map((kind) => (
            <label key={kind} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-white/[0.02] border border-white/5">
              <span className="text-sm text-white">{kind}</span>
              <input className="w-28 bg-neutral-950 border border-white/10 rounded-lg px-3 py-2 text-right text-white tabular-nums focus:outline-none focus:border-blue-500" type="number" min="0" step="50" inputMode="numeric"
                value={prices[kind]} onChange={(e) => setPrices((p) => ({ ...p, [kind]: e.target.value }))} placeholder={cfg.suggested?.[kind] ? String(cfg.suggested[kind]) : '—'} aria-label={`Prix : ${kind}`} />
            </label>
          ))}
        </div>
        {cfg.treatments && (
          <fieldset>
            <legend className="text-sm font-medium text-neutral-400 mb-2">Traitements (coefficient appliqué au prix de l'article)</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESSING_TREATMENTS.map((t) => (
                <label key={t.key} className="block">
                  <span className="block text-xs text-neutral-500 mb-1">{t.label}</span>
                  <input className={cn(inputCls, 'tabular-nums')} inputMode="decimal" value={factors[t.key]} onChange={(e) => setFactors((f) => ({ ...f, [t.key]: e.target.value }))} disabled={t.key === 'lavage'} />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          {cfg.express && (
            <label className="block">
              <span className="block text-sm font-medium text-neutral-400 mb-1">Supplément express (%)</span>
              <input className={cn(inputCls, 'tabular-nums')} type="number" min="0" max="300" value={rate} onChange={(e) => setRate(e.target.value)} />
            </label>
          )}
          {cfg.places && (
            <label className="block">
              <span className="block text-sm font-medium text-neutral-400 mb-1">{cfg.feeLabel} par défaut (FCFA)</span>
              <input className={cn(inputCls, 'tabular-nums')} type="number" min="0" step="100" value={travelFee} onChange={(e) => setTravelFee(e.target.value)} placeholder="1000" />
            </label>
          )}
        </div>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <button type="submit" disabled={saving} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl transition-colors">
          {saving ? 'Enregistrement…' : 'Enregistrer les tarifs'}
        </button>
      </form>
    </Modal>
  );
}

function OrderRow({ order, partnerOrder, onAdvance, onBack, onCancel, onPay, onEdit, onShare, onOutsource, onTakeBack, onPrint, busy }) {
  const cfg = useActivity();
  const [menu, setMenu] = useState(false);
  const [details, setDetails] = useState(false);
  const status = statusInfo(cfg.key, order.status, order.place);
  const late = isLateCarpet(order);
  const open = isOpenCarpet(order);
  const next = NEXT_STATUS[order.status];
  const due = amountDue(order);
  const waitingDays = daysSinceReady(order);
  const homeVisit = order.place === 'domicile' && cfg.key === 'salon';
  return (
    <div className="p-4 sm:p-5 border-b border-white/5 last:border-0">
      <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
        <div className="w-16 shrink-0">
          <p className="text-[11px] uppercase tracking-wide text-neutral-500">Ticket</p>
          <p className="text-2xl font-bold text-white tabular-nums leading-tight">{order.ticketNo}</p>
          {order.express && <p className="mt-1 inline-flex items-center gap-0.5 text-[10px] font-bold text-amber-300"><Zap className="w-3 h-3" /> EXPRESS</p>}
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
          {order.place === 'domicile' && (
            <p className="text-xs mt-1 text-sky-300 flex items-start gap-1"><MapPin className="w-3.5 h-3.5 shrink-0 mt-px" /> {cfg.homeLabel}{order.address ? ` · ${order.address}` : ''}</p>
          )}
          {order.rack && <p className="text-xs mt-1 text-neutral-300 flex items-center gap-1"><Archive className="w-3.5 h-3.5 text-neutral-500" /> {order.rack}</p>}
          {order.note && <p className="text-neutral-500 text-xs mt-1 italic">« {order.note} »</p>}
          {partnerOrder && partnerOrder.status !== 'annule' && (
            <p className="text-xs mt-1.5 text-blue-300 flex items-center gap-1">
              <Send className="w-3 h-3 shrink-0" /> Confié à {partnerOrder.partner?.name || 'une station partenaire'} · {partnerOrder.status === 'pret' ? 'prêt, à récupérer chez elle' : statusInfo(cfg.key, partnerOrder.status).label.toLowerCase()}
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
              <Clock className="w-3.5 h-3.5" /> {homeVisit ? 'Intervention' : 'Promis'} {formatPromise(order.promisedAt)} · {timeLeftLabel(order.promisedAt)}
            </p>
          )}
          {order.status === 'pret' && order.readyAt && (
            <p className={cn('text-xs mt-1.5', waitingDays >= UNCLAIMED_DAYS ? 'text-red-400 font-medium' : 'text-emerald-400')}>
              {waitingDays >= UNCLAIMED_DAYS ? `Non retiré depuis ${waitingDays} jours` : `Prêt depuis le ${formatPromise(order.readyAt)}`}
            </p>
          )}
          {order.status === 'recupere' && order.pickedUpAt && <p className="text-xs mt-1.5 text-neutral-500">{status.label} le {formatPromise(order.pickedUpAt)}</p>}
        </div>
        <div className="sm:text-right min-w-[110px]">
          <p className="text-white font-bold tabular-nums">{order.amount ? fcfa(order.amount) : '—'}</p>
          <p className={cn('text-xs mt-0.5', order.paid ? 'text-emerald-400' : 'text-amber-400')}>
            {order.paid ? `Payé (${order.paymentMethod || 'Espèces'})` : order.status === 'annule' ? 'Non encaissé' : order.amountPaid > 0 ? `Avance ${fcfa(order.amountPaid)} · reste ${fcfa(due)}` : 'À encaisser'}
          </p>
        </div>
      </div>

      {order.status !== 'annule' && (
        <div className="flex flex-wrap items-center gap-2 mt-3 sm:pl-[84px]">
          {next && (
            <button type="button" onClick={() => onAdvance(order, next)} disabled={busy}
              className={cn('inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors disabled:opacity-60',
                next === 'pret' ? 'bg-emerald-600 hover:bg-emerald-500 text-white' : 'bg-blue-600 hover:bg-blue-500 text-white')}>
              <Check className="w-4 h-4" /> {actionLabel(cfg.key, order.status, order.place)}
            </button>
          )}
          {!order.paid && (
            <button type="button" onClick={() => onPay(order)} className={smallBtn}>
              <Coins className="w-4 h-4 text-amber-400" /> Encaisser
            </button>
          )}
          {open && (
            <button type="button" onClick={() => onShare(order)} className={smallBtn}>
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
                <div className="absolute z-20 mt-1 left-0 w-60 rounded-xl bg-neutral-900 border border-white/10 shadow-2xl py-1">
                  <button type="button" onClick={() => { setMenu(false); onEdit(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Pencil className="w-4 h-4" /> Modifier {cfg.units}, prix, délai</button>
                  <button type="button" onClick={() => { setMenu(false); onPrint(order, 'ticket'); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Printer className="w-4 h-4" /> Imprimer le ticket</button>
                  {cfg.labels && (
                    <button type="button" onClick={() => { setMenu(false); onPrint(order, 'labels'); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Tags className="w-4 h-4" /> Imprimer les étiquettes</button>
                  )}
                  {PREV_STATUS[order.status] && (
                    <button type="button" onClick={() => { setMenu(false); onBack(order, PREV_STATUS[order.status]); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Undo2 className="w-4 h-4" /> Revenir à « {statusInfo(cfg.key, PREV_STATUS[order.status], order.place).label} »</button>
                  )}
                  {['depose', 'lavage', 'sechage'].includes(order.status) && !order.fromStationId && !homeVisit && (!partnerOrder || partnerOrder.status === 'annule') && (
                    <button type="button" onClick={() => { setMenu(false); onOutsource(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Send className="w-4 h-4" /> Confier à une autre station</button>
                  )}
                  {partnerOrder && partnerOrder.status === 'depose' && (
                    <button type="button" onClick={() => { setMenu(false); onTakeBack(order); }} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-neutral-200 hover:bg-white/5"><Undo2 className="w-4 h-4" /> Reprendre chez {partnerOrder.partner?.name || 'la station'}</button>
                  )}
                  {open && !order.paid && !(order.amountPaid > 0) && (
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

// Fenêtre « prêt » / « lien de suivi » ; pressing prêt : l'emplacement d'abord.
function ShareModal({ order, stationName, onClose, onSaved }) {
  const cfg = useActivity();
  const [rack, setRack] = useState(order.rack || '');
  const [saving, setSaving] = useState(false);
  const [savedRack, setSavedRack] = useState(order.rack || '');
  const ready = order.status === 'pret';
  const saveRack = async () => {
    setSaving(true);
    try { const o = await updateCarpetOrder(order, { rack }); setSavedRack(o.rack); onSaved(o); } catch { /* l'emplacement reste à saisir */ } finally { setSaving(false); }
  };
  return (
    <Modal title={ready ? `Ticket n° ${order.ticketNo} prêt` : `Lien de suivi · ticket n° ${order.ticketNo}`} onClose={onClose}>
      {ready && cfg.racks && (
        <div className="mb-5">
          <label htmlFor="sh-rack" className="block text-sm font-medium text-neutral-400 mb-1">Emplacement du linge (portant, casier)</label>
          <div className="flex gap-2">
            <input id="sh-rack" className={inputCls} value={rack} onChange={(e) => setRack(e.target.value)} placeholder="Portant B, 12" autoFocus />
            <button type="button" onClick={saveRack} disabled={saving || rack.trim() === savedRack} className="shrink-0 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-white font-medium px-4 rounded-xl">
              {rack.trim() && rack.trim() === savedRack ? <Check className="w-4 h-4 text-emerald-400" /> : 'Noter'}
            </button>
          </div>
        </div>
      )}
      <p className="text-sm text-neutral-400 mb-4">
        {ready
          ? `Prévenez ${order.clientName} que son dépôt est prêt. S'il a créé son compte, il le voit déjà dans « ${CLIENT_DEPOSITS_LABEL} ».`
          : `${order.clientName} suit l'avancement avec ce lien et peut créer son compte pour être prévenu.`}
      </p>
      <ShareLink order={order} stationName={stationName} ready={ready} />
    </Modal>
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
  const Icon = ICONS[cfg.key] || Layers;
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
  const [showPrices, setShowPrices] = useState(false);
  const [paying, setPaying] = useState(null);
  const [editing, setEditing] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState('');
  const [priceList, setPriceList] = useState(emptyPriceList);

  useEffect(() => {
    let cancelled = false;
    loadPriceList(stationId, cfg.key).then((list) => { if (!cancelled) setPriceList(list); });
    return () => { cancelled = true; };
  }, [stationId, cfg.key]);

  // Clients déjà venus (nom, téléphone, adresse), du plus récent au plus ancien.
  const knownClients = useMemo(() => {
    const seen = new Map();
    orders.forEach((o) => {
      if (o.fromStationId || !o.clientName) return;
      const key = o.clientName.trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, { name: o.clientName.trim(), phone: o.clientPhone || '', address: o.address || '' });
    });
    return [...seen.values()];
  }, [orders]);

  const now = new Date();
  const inProgress = orders.filter((o) => ['depose', 'lavage', 'sechage'].includes(o.status));
  const ready = orders.filter((o) => o.status === 'pret');
  const unclaimed = ready.filter((o) => daysSinceReady(o, now) >= UNCLAIMED_DAYS);
  const late = inProgress.filter((o) => isLateCarpet(o, now));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthRevenue = (transactions || []).filter((t) => t.service === cfg.service && new Date(t.createdAt) >= monthStart).reduce((s, t) => s + (parseInt(t.amount, 10) || 0), 0);
  const toCollect = orders.filter((o) => isOpenCarpet(o)).reduce((s, o) => s + amountDue(o), 0);

  const list = useMemo(() => {
    const base = tab === 'cours'
      ? [...inProgress].sort((a, b) => new Date(a.promisedAt) - new Date(b.promisedAt))
      // Prêts : le plus ancien en premier (les non retirés remontent).
      : tab === 'prets' ? [...ready].sort((a, b) => new Date(a.readyAt || a.promisedAt) - new Date(b.readyAt || b.promisedAt)) : orders.filter((o) => !isOpenCarpet(o));
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((o) => String(o.ticketNo) === q.replace(/^n°\s*/, '').split('-')[0] || (o.clientName || '').toLowerCase().includes(q) || (o.clientPhone || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')) || (o.rack || '').toLowerCase().includes(q));
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
    if (status === 'recupere' && !order.paid && amountDue(order) > 0 && !window.confirm(`Ticket n° ${order.ticketNo} pas encore soldé (reste ${fcfa(amountDue(order))}). Le marquer quand même comme remis ?`)) return;
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
  const print = (order, what) => {
    if (!printDeposit(order, { stationName, what })) setActionError("L'impression n'a pas pu démarrer. Réessayez.");
  };
  const hasPrices = Object.keys(priceList.prices || {}).length > 0;

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
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowPrices(true)} className="inline-flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-3 rounded-xl font-medium transition-colors">
            <Tags className="w-5 h-5" /> Tarifs{!hasPrices && <span className="w-2 h-2 rounded-full bg-amber-400" title="Aucun tarif enregistré" />}
          </button>
          <button type="button" onClick={() => setShowNew(true)} className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-bold transition-colors">
            <Plus className="w-5 h-5" /> Nouveau dépôt
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8">
        <Card className="border-white/5 bg-white/[0.02]"><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">En cours</p>
          <p className="text-3xl font-bold text-white tabular-nums">{inProgress.length}</p>
        </CardContent></Card>
        <Card className="border-white/5 bg-white/[0.02]"><CardContent className="p-4 sm:p-6">
          <p className="text-neutral-400 text-sm font-medium mb-1">Prêts à récupérer</p>
          <p className="text-3xl font-bold text-emerald-400 tabular-nums">{ready.length}</p>
          {unclaimed.length > 0 && <p className="text-xs text-red-400 mt-1">dont {unclaimed.length} depuis +{UNCLAIMED_DAYS} jours</p>}
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
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={cfg.racks ? 'Nom, téléphone, ticket ou portant' : 'Nom, téléphone ou n° de ticket'} aria-label="Rechercher un dépôt"
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
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {!hasPrices && <button type="button" onClick={() => setShowPrices(true)} className="inline-flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white px-5 py-3 rounded-xl font-medium transition-colors"><Tags className="w-5 h-5" /> Saisir mes tarifs</button>}
                <button type="button" onClick={() => setShowNew(true)} className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-3 rounded-xl font-bold transition-colors"><Plus className="w-5 h-5" /> Premier dépôt</button>
              </div>
            </>
          ) : (
            <p className="text-neutral-400">{query ? 'Aucun dépôt ne correspond à la recherche.' : tab === 'prets' ? 'Aucun dépôt prêt en attente du client.' : tab === 'cours' ? 'Aucun dépôt en cours.' : 'Aucun dépôt terminé.'}</p>
          )}
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
          {list.map((o) => (
            <OrderRow key={o.id} order={o} busy={busyId === o.id} partnerOrder={o.partnerOrderId ? sentById.get(o.partnerOrderId) : null}
              onAdvance={changeStatus} onBack={changeStatus} onCancel={cancelOrder} onPrint={print}
              onPay={setPaying} onEdit={setEditing} onShare={setSharing} onOutsource={setOutsourcing} onTakeBack={takeBack} />
          ))}
        </div>
      )}

      {showNew && <NewDepositModal stationId={stationId} stationName={stationName} priceList={priceList} knownClients={knownClients} onClose={() => setShowNew(false)} onSaved={(o) => { upsertLocal(o); setTab('cours'); }} />}
      {showPrices && <PriceListModal stationId={stationId} priceList={priceList} onClose={() => setShowPrices(false)} onSaved={setPriceList} />}
      {outsourcing && <OutsourceModal order={outsourcing} myStationId={stationId} onClose={() => setOutsourcing(null)} onDone={async () => { await reload(); setTab('partenaires'); }} />}
      {paying && <PayModal order={paying} onClose={() => setPaying(null)} onDone={reload} />}
      {editing && <EditModal order={editing} priceList={priceList} onClose={() => setEditing(null)} onSaved={upsertLocal} />}
      {sharing && <ShareModal order={sharing} stationName={stationName} onClose={() => setSharing(null)} onSaved={(o) => { upsertLocal(o); setSharing(o); }} />}
    </div>
    </ActivityContext.Provider>
  );
}
