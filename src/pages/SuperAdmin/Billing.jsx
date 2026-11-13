import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertTriangle, Bell, Clock, Infinity as InfinityIcon, XCircle, Smartphone, Search, Gift, X, Banknote, Eraser, Loader2, ChevronDown, Check } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent, trialLabel, FREE_ACCESS_OPTIONS, freeAccessPlan } from '../../lib/stationTrial';
import { daysUntil, REMINDER_DAYS } from '../../lib/subscriptionReminders';
import { validatedMRR, validatedStations, modulesMRR, stationPrice } from '../../lib/platformRevenue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const frDate = (d) => new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

// Fenêtre « Offrir un accès gratuit » : durée au choix (FREE_ACCESS_OPTIONS),
// effet expliqué avant de valider (freeAccessPlan, lib/stationTrial.js).
function FreeAccessModal({ station, planLabel, onClose, onGrant }) {
  const [days, setDays] = useState(FREE_ACCESS_OPTIONS[0].days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const plan = freeAccessPlan(station, days);
  const effect = plan.mode === 'echeance'
    ? `Abonnement déjà payé jusqu'au ${frDate(plan.from)} : la prochaine échéance passera au ${frDate(plan.until)}.`
    : plan.mode === 'prolongation'
      ? `Accès gratuit en cours jusqu'au ${frDate(plan.from)} : il sera prolongé jusqu'au ${frDate(plan.until)}.`
      : `La station aura accès à son espace gratuitement jusqu'au ${frDate(plan.until)}. Ensuite, elle devra payer son offre (${planLabel}) pour continuer.`;

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onGrant(station.id, days);
      onClose();
    } catch (err) {
      setError(err?.message || "L'accès n'a pas pu être offert. Réessayez.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="free-access-title"
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close">
          <X className="w-6 h-6" />
        </button>
        <div className="p-3 rounded-xl bg-purple-500/10 w-fit mb-4"><Gift className="w-6 h-6 text-purple-400" /></div>
        <h2 id="free-access-title" className="text-2xl font-bold text-white mb-1">Offrir un accès gratuit</h2>
        <p className="text-neutral-400 mb-6">{station.name}</p>

        <div className="grid grid-cols-3 gap-2 mb-5" role="radiogroup" aria-label="Durée offerte">
          {FREE_ACCESS_OPTIONS.map((o) => {
            const active = o.days === days;
            return (
              <button
                key={o.days}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setDays(o.days)}
                className={`rounded-xl border px-3 py-3 text-center transition-colors ${active ? 'border-purple-500 bg-purple-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
              >
                <span className="block font-bold">{o.label}</span>
                <span className="block text-xs text-neutral-400 mt-0.5">{o.days} jours</span>
              </button>
            );
          })}
        </div>

        <p className="text-sm text-neutral-300 leading-relaxed rounded-xl bg-white/[0.03] border border-white/5 p-4 mb-5">{effect}</p>
        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors">Annuler</button>
          <button type="button" onClick={submit} disabled={busy} className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <Gift className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Offrir'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Date « AAAA-MM-JJ » d'un instant (champ <input type="date">).
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// +N mois en restant sur le dernier jour du mois si besoin (31/01 → 28/02),
// comme make_interval(months => n) côté base.
function addMonths(date, n) {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
}

// Début par défaut d'une période payée : l'échéance en cours si la station
// est à jour (le mois suivant s'enchaîne, même en retard), sinon aujourd'hui.
// Même règle que superadmin_record_station_payment.
const defaultPeriodStart = (s) => (s.subscriptionStatus === 'a_jour' && s.nextBillingDate ? new Date(s.nextBillingDate) : new Date());

// Abonnement terminé sans que la station ait payé : à valider à la main.
const isPastDue = (s) => s.subscriptionStatus === 'a_jour' && s.nextBillingDate && new Date(s.nextBillingDate) < new Date();

// Seule une station qui n'a jamais payé peut voir ses données d'essai vidées
// (même règle en base, superadmin_purge_trial_data).
const canPurgeTrial = (s) => s.subscriptionStatus === 'essai' || s.subscriptionStatus === 'a_payer';

const MONTH_OPTIONS = [1, 2, 3, 6, 12];
const PAYMENT_METHODS = ['Espèces', 'Wave', 'Orange Money', 'Virement'];

const TRIAL_DATA_LABELS = [
  ['reservations', 'Lavages (file et historique)'],
  ['transactions', 'Transactions encaissées'],
  ['expenses', 'Dépenses'],
  ['shop_sales', 'Ventes sur place de la boutique'],
  ['shop_stock_movements', 'Mouvements de stock'],
  ['shop_orders', 'Commandes boutique'],
  ['attendance_records', 'Pointages (laveurs, pompistes)'],
  ['client_subscriptions', 'Abonnements clients et leurs factures'],
  ['vidange_bookings', 'Rendez-vous de vidange'],
  ['carpet_orders', 'Dépôts de tapis et de chaussures'],
  ['reviews', 'Avis clients'],
];
const trialDataTotal = (counts) => TRIAL_DATA_LABELS.reduce((sum, [key]) => sum + (Number(counts?.[key]) || 0), 0);

// Liste « ce qui sera effacé » : partagée par la fenêtre de vidage et la
// case « Vider d'abord les données d'essai » de l'encaissement.
function TrialDataList({ counts }) {
  const rows = TRIAL_DATA_LABELS.filter(([key]) => Number(counts?.[key]) > 0);
  const products = Number(counts?.products_with_stock) || 0;
  if (rows.length === 0 && products === 0) {
    return <p className="text-sm text-neutral-400">Aucune donnée d'essai : rien à effacer.</p>;
  }
  return (
    <ul className="text-sm divide-y divide-white/5">
      {rows.map(([key, label]) => (
        <li key={key} className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-neutral-300">{label}</span>
          <span className="font-semibold text-white tabular-nums">{Number(counts[key]).toLocaleString('fr-FR')}</span>
        </li>
      ))}
      {products > 0 && (
        <li className="flex items-center justify-between gap-3 py-1.5">
          <span className="text-neutral-300">Articles dont le stock repart à 0</span>
          <span className="font-semibold text-white tabular-nums">{products.toLocaleString('fr-FR')}</span>
        </li>
      )}
    </ul>
  );
}

// Fenêtre « Encaisser un abonnement » : paiement reçu hors ligne (espèces le
// plus souvent). Prolonge de N mois et enregistre la recette
// (recordStationPayment, useSuperAdminState.jsx). Pour une station encore en
// essai, propose d'abord de vider ses données de test.
function PaymentModal({ station, planLabel, monthlyPrice, onClose, onRecord, onCountTrial, onPurgeTrial }) {
  const [months, setMonths] = useState(1);
  const [amount, setAmount] = useState(String(monthlyPrice));
  const [amountEdited, setAmountEdited] = useState(false);
  const [method, setMethod] = useState('Espèces');
  const [start, setStart] = useState(() => isoDay(defaultPeriodStart(station)));
  const [purgeFirst, setPurgeFirst] = useState(false);
  const [trialCounts, setTrialCounts] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trial = canPurgeTrial(station);

  useEffect(() => { if (!amountEdited) setAmount(String(monthlyPrice * months)); }, [months, monthlyPrice, amountEdited]);
  useEffect(() => {
    if (!trial) return;
    let cancelled = false;
    onCountTrial(station.id).then((c) => { if (!cancelled) setTrialCounts(c); }, () => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial, station.id]);

  const startDate = start ? new Date(`${start}T00:00:00Z`) : null;
  const endDate = startDate ? addMonths(startDate, months) : null;
  const amountValue = Math.max(0, parseInt(amount, 10) || 0);
  const trialTotal = trialDataTotal(trialCounts) + (Number(trialCounts?.products_with_stock) || 0);

  const submit = async () => {
    if (!startDate) { setError('Choisissez la date de début.'); return; }
    setBusy(true);
    setError('');
    try {
      if (trial && purgeFirst && trialTotal > 0) await onPurgeTrial(station.id);
      await onRecord(station.id, { months, amount: amountValue, method, start });
      onClose();
    } catch (err) {
      setError(err?.message || "Le paiement n'a pas pu être enregistré. Réessayez.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="payment-title"
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close">
          <X className="w-6 h-6" />
        </button>
        <div className="p-3 rounded-xl bg-emerald-500/10 w-fit mb-4"><Banknote className="w-6 h-6 text-emerald-400" /></div>
        <h2 id="payment-title" className="text-2xl font-bold text-white mb-1">Encaisser un abonnement</h2>
        <p className="text-neutral-400 mb-6">{station.name} · {planLabel} · {monthlyPrice.toLocaleString('fr-FR')} FCFA/mois</p>

        <p className="text-sm font-medium text-neutral-300 mb-2">Durée payée</p>
        <div className="grid grid-cols-5 gap-2 mb-5" role="radiogroup" aria-label="Durée payée">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === months}
              onClick={() => setMonths(m)}
              className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${m === months ? 'border-emerald-500 bg-emerald-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
            >
              <span className="block font-bold">{m}</span>
              <span className="block text-[11px] text-neutral-400">mois</span>
            </button>
          ))}
        </div>

        <p className="text-sm font-medium text-neutral-300 mb-2">Moyen de paiement</p>
        <div className="flex flex-wrap gap-2 mb-5" role="radiogroup" aria-label="Moyen de paiement">
          {PAYMENT_METHODS.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === method}
              onClick={() => setMethod(m)}
              className={`rounded-lg border px-3 py-2 text-sm transition-colors ${m === method ? 'border-emerald-500 bg-emerald-500/15 text-white' : 'border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]'}`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          <label className="block">
            <span className="block text-sm font-medium text-neutral-300 mb-2">Montant reçu (FCFA)</span>
            <input
              type="number" inputMode="numeric" min="0" step="500"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountEdited(true); }}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-neutral-300 mb-2">À partir du</span>
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 [color-scheme:dark]"
            />
          </label>
        </div>

        {endDate && (
          <p className="text-sm text-neutral-300 leading-relaxed rounded-xl bg-white/[0.03] border border-white/5 p-4 mb-5">
            Abonnement payé du <strong className="text-white">{frDate(startDate)}</strong> au <strong className="text-white">{frDate(endDate)}</strong>.
            {' '}La station passe « À jour » et {amountValue.toLocaleString('fr-FR')} FCFA comptent dans les revenus encaissés.
          </p>
        )}

        {trial && (
          <label className={`flex items-start gap-3 rounded-xl border p-4 mb-5 cursor-pointer ${purgeFirst ? 'border-amber-500/50 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
            <input type="checkbox" checked={purgeFirst} onChange={(e) => setPurgeFirst(e.target.checked)} className="mt-1 accent-amber-500" disabled={trialCounts != null && trialTotal === 0} />
            <span className="text-sm">
              <span className="block font-semibold text-white">Vider d'abord les données d'essai</span>
              <span className="block text-neutral-400 mt-0.5">
                {trialCounts == null ? 'Comptage en cours…' : trialTotal === 0 ? 'Aucune donnée d\'essai à effacer.' : `${trialTotal.toLocaleString('fr-FR')} élément${trialTotal > 1 ? 's' : ''} saisi${trialTotal > 1 ? 's' : ''} pendant l'essai seront effacés : la comptabilité démarre propre. Irréversible.`}
              </span>
            </span>
          </label>
        )}

        {error && <p className="text-sm text-red-400 mb-4">{error}</p>}

        <div className="flex gap-3">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors">Annuler</button>
          <button type="button" onClick={submit} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4" /> {busy ? 'Enregistrement…' : 'Valider le paiement'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// Fenêtre « Vider les données d'essai » : aperçu de ce qui sera effacé, puis
// confirmation écrite (le mot VIDER) — l'effacement est définitif.
function PurgeTrialModal({ station, onClose, onCount, onPurge }) {
  const [counts, setCounts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  useEffect(() => {
    let cancelled = false;
    onCount(station.id).then(
      (c) => { if (!cancelled) setCounts(c); },
      (err) => { if (!cancelled) setLoadError(err?.message || 'Comptage impossible.'); },
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station.id]);

  const total = trialDataTotal(counts) + (Number(counts?.products_with_stock) || 0);
  const ready = confirmText.trim().toUpperCase() === 'VIDER';

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      setDone(await onPurge(station.id));
    } catch (err) {
      setError(err?.message || "L'effacement n'a pas abouti. Réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        role="dialog" aria-modal="true" aria-labelledby="purge-title"
        className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} disabled={busy} aria-label="Fermer" className="modal-close">
          <X className="w-6 h-6" />
        </button>
        <div className="p-3 rounded-xl bg-amber-500/10 w-fit mb-4"><Eraser className="w-6 h-6 text-amber-400" /></div>
        <h2 id="purge-title" className="text-2xl font-bold text-white mb-1">Vider les données d'essai</h2>
        <p className="text-neutral-400 mb-5">{station.name}</p>

        {done ? (
          <>
            <p className="text-sm text-emerald-300 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-4 mb-4">Données d'essai effacées. La station repart avec une comptabilité vide.</p>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-2 mb-5"><TrialDataList counts={done} /></div>
            <button type="button" onClick={onClose} className="w-full bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors">Fermer</button>
          </>
        ) : (
          <>
            <p className="text-sm text-neutral-300 leading-relaxed mb-4">
              Tout ce que la station a saisi pendant son essai sera effacé, pour qu'aucun chiffre de test n'entre dans sa comptabilité.
              Restent en place : la station, son offre, ses tarifs, son équipe, son catalogue (stocks remis à 0) et les paiements passés par la plateforme (PayDunya, publicités).
            </p>
            <div className="rounded-xl bg-white/[0.03] border border-white/5 px-4 py-2 mb-5">
              {loadError ? <p className="text-sm text-red-400 py-1.5">{loadError}</p>
                : counts == null ? <p className="text-sm text-neutral-400 py-1.5 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Comptage…</p>
                  : <TrialDataList counts={counts} />}
            </div>
            {total > 0 && (
              <label className="block mb-5">
                <span className="block text-sm text-neutral-300 mb-2">Effacement définitif. Tapez <strong className="text-white">VIDER</strong> pour confirmer.</span>
                <input
                  type="text" autoComplete="off" autoCapitalize="characters"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-amber-500"
                />
              </label>
            )}
            {error && <p className="text-sm text-red-400 mb-4">{error}</p>}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} disabled={busy} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-semibold py-3 rounded-xl transition-colors">Annuler</button>
              {total > 0 && (
                <button type="button" onClick={submit} disabled={busy || !ready} className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:hover:bg-red-600 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
                  <Eraser className="w-4 h-4" /> {busy ? 'Effacement…' : 'Vider'}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

// ─── Liste des stations ────────────────────────────────────────────────

// « 16 oct. » (année ajoutée si ce n'est pas l'année en cours).
const shortDate = (d) => {
  const x = new Date(d);
  const sameYear = x.getFullYear() === new Date().getFullYear();
  return x.toLocaleDateString('fr-FR', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};
// Retard depuis une date passée : « Depuis 18 jours » (la date est sur la jauge).
const sinceLabel = (end, now) => {
  const n = -daysUntil(end, now);
  return n <= 0 ? "Depuis aujourd'hui" : `Depuis ${n} jour${n > 1 ? 's' : ''}`;
};

// Couleur d'une situation : point, texte, jauge et liseré de la ligne.
const TONES = {
  emerald: { dot: 'bg-emerald-400', text: 'text-emerald-300', rgb: '52,211,153' },
  sky: { dot: 'bg-sky-400', text: 'text-sky-300', rgb: '56,189,248' },
  amber: { dot: 'bg-amber-400', text: 'text-amber-300', rgb: '251,191,36' },
  red: { dot: 'bg-red-400', text: 'text-red-300', rgb: '248,113,113' },
  violet: { dot: 'bg-violet-300', text: 'text-violet-300', rgb: '196,181,253' },
};

// Où en est la station dans sa période (essai ou mois payé) : libellé, détail
// daté, jauge, et `due` quand un paiement est attendu maintenant (essai
// terminé, échéance dépassée, impayé, premier paiement).
function cycleOf(s, now = new Date()) {
  const status = s.subscriptionStatus;
  if (status === 'illimite') return { tone: 'violet', title: 'Accès illimité', detail: 'Offert, sans échéance' };
  if (status === 'a_payer') {
    return { tone: 'amber', title: 'Premier paiement attendu', detail: s.joinedAt ? `Inscrite le ${shortDate(s.joinedAt)}` : 'Offre jamais activée', due: true };
  }
  if (status === 'essai') {
    const offered = !!s.trialStartedAt;
    if (!s.trialEndsAt) return { tone: 'sky', title: trialLabel(offered), detail: 'Sans date de fin' };
    const end = new Date(s.trialEndsAt);
    const start = new Date(s.trialStartedAt || s.joinedAt || end);
    const left = trialDaysRemaining(s.trialEndsAt);
    if (left <= 0) {
      return {
        tone: 'amber', title: offered ? 'Accès gratuit terminé' : 'Essai terminé', detail: sinceLabel(end, now),
        gauge: { from: start, to: end, over: Math.max(0, -daysUntil(end, now)) }, due: true,
      };
    }
    return {
      tone: 'sky', title: trialLabel(offered), detail: `Encore ${left} j, jusqu'au ${shortDate(end)}`,
      gauge: { from: start, to: end, pct: trialProgressPercent(s.trialEndsAt, s.trialStartedAt || s.joinedAt) },
    };
  }
  const end = s.nextBillingDate ? new Date(s.nextBillingDate) : null;
  const start = end ? addMonths(end, -1) : null;
  if (status === 'en_retard') {
    const late = end && end < now;
    return {
      tone: 'red', title: 'Impayé', detail: late ? sinceLabel(end, now) : 'Paiement non reçu',
      gauge: late ? { from: start, to: end, over: Math.max(0, -daysUntil(end, now)) } : null, due: true,
    };
  }
  if (!end) return { tone: 'emerald', title: 'Payé', detail: "Sans date d'échéance" };
  if (isPastDue(s)) {
    return {
      tone: 'red', title: 'Échéance dépassée', detail: sinceLabel(end, now),
      gauge: { from: start, to: end, over: Math.max(0, -daysUntil(end, now)) }, due: true,
    };
  }
  const pct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const left = daysUntil(end, now);
  if (left <= REMINDER_DAYS) {
    return { tone: 'amber', title: 'Échéance proche', detail: left <= 0 ? "Aujourd'hui" : `Dans ${left} j, le ${shortDate(end)}`, gauge: { from: start, to: end, pct } };
  }
  return { tone: 'emerald', title: 'Payé', detail: `Jusqu'au ${shortDate(end)}`, gauge: { from: start, to: end, pct } };
}

// Jauge de la période : remplie jusqu'à aujourd'hui ; une fois l'échéance
// passée, la période se fige à gauche du repère et le retard s'affiche en
// hachures au-delà.
function CycleGauge({ gauge, tone }) {
  if (!gauge) return null;
  const t = TONES[tone];
  if (gauge.over != null) {
    return (
      <div className="mt-2.5 max-w-[280px]" aria-hidden="true">
        <div className="flex h-1.5 items-center gap-[3px]">
          <div className="h-full basis-[66%] rounded-l-full bg-white/[0.13]" />
          <div className="h-3.5 w-[2px] shrink-0 rounded-full bg-white/50" />
          <div
            className="h-full flex-1 rounded-r-full"
            style={{ backgroundImage: `repeating-linear-gradient(-45deg, rgba(${t.rgb},0.95) 0 3px, rgba(${t.rgb},0.22) 3px 6px)` }}
          />
        </div>
        <div className="relative mt-1.5 h-4 text-[11px] tabular-nums text-neutral-500">
          <span className="absolute left-0">{shortDate(gauge.from)}</span>
          <span className="absolute left-[66%] -translate-x-1/2 text-neutral-300">{shortDate(gauge.to)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-2.5 max-w-[280px]" aria-hidden="true">
      <div className="relative h-1.5 rounded-full bg-white/[0.07]">
        <div
          className={`absolute inset-y-0 left-0 rounded-full ${t.dot}`}
          style={{ width: `${Math.max(gauge.pct, 4)}%`, boxShadow: `0 0 12px rgba(${t.rgb},0.45)` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-neutral-500">
        <span>{shortDate(gauge.from)}</span>
        <span>{shortDate(gauge.to)}</span>
      </div>
    </div>
  );
}

const initials = (name) => (name || '?').split(/[^\p{L}\p{N}]+/u).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

function StationMark({ station }) {
  const [broken, setBroken] = useState(false);
  if (station.logo && !broken) {
    return <img src={station.logo} alt="" loading="lazy" onError={() => setBroken(true)} className="h-10 w-10 shrink-0 rounded-xl object-cover ring-1 ring-white/10" />;
  }
  return (
    <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.05] font-display text-[13px] font-bold tracking-wide text-neutral-200 ring-1 ring-inset ring-white/10">
      {initials(station.name)}
    </span>
  );
}

const BTN_BASE = 'inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-semibold transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950';
const BTN_STRONG = `${BTN_BASE} bg-emerald-400 text-emerald-950 hover:bg-emerald-300 focus-visible:ring-emerald-300/70`;
const BTN_QUIET = `${BTN_BASE} bg-white/[0.04] text-neutral-200 ring-1 ring-inset ring-white/10 hover:bg-white/[0.08] hover:text-white focus-visible:ring-white/40`;

// Menu « Gérer » d'une ligne : rendu dans <body> pour ne pas être coupé par
// la liste, ouvert vers le haut quand la place manque en bas de l'écran.
function ManageMenu({ label, items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);

  const close = useCallback((focusBack) => {
    setOpen(false);
    setPos(null);
    if (focusBack) btnRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open || !menuRef.current || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = menuRef.current;
    const below = window.innerHeight - r.bottom >= h + 12 || r.top < h + 12;
    setPos({
      top: below ? r.bottom + 6 : r.top - h - 6,
      left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)),
      up: !below,
    });
  }, [open]);

  useEffect(() => {
    // preventScroll : sans lui, Chrome fait glisser <main> (qui déborde à
    // cause du halo d'AppShell) au moment du focus.
    if (open && pos) menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, pos]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!menuRef.current?.contains(e.target) && !btnRef.current?.contains(e.target)) close(false); };
    const onScroll = (e) => { if (!(e.target instanceof Node) || !menuRef.current?.contains(e.target)) close(false); };
    const onResize = () => close(false);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(true); } };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  const onMenuKey = (e) => {
    const list = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const i = list.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus({ preventScroll: true }); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab') close(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? close(false) : setOpen(true))}
        className={`${BTN_QUIET} ${open ? 'bg-white/[0.08] text-white' : ''}`}
      >
        Gérer <ChevronDown className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              role="menu"
              aria-label={label}
              onKeyDown={onMenuKey}
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
              transition={{ duration: 0.16, ease: [0.23, 1, 0.32, 1] }}
              style={{
                position: 'fixed',
                zIndex: 60,
                transformOrigin: pos?.up ? 'bottom right' : 'top right',
                ...(pos ? { top: pos.top, left: pos.left } : { top: 0, left: 0, visibility: 'hidden' }),
              }}
              className="w-72 rounded-xl border border-white/10 bg-neutral-900 p-1.5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)]"
            >
              {items.map((item, i) => (item.separator ? (
                <div key={`sep-${i}`} role="separator" className="my-1.5 h-px bg-white/[0.07]" />
              ) : (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  onClick={() => { close(false); item.onSelect(); }}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors ${item.danger ? 'hover:bg-amber-400/10 focus:bg-amber-400/10' : 'hover:bg-white/[0.06] focus:bg-white/[0.06]'}`}
                >
                  <item.icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.danger ? 'text-amber-300' : 'text-neutral-400'}`} />
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${item.danger ? 'text-amber-200' : 'text-neutral-100'}`}>{item.label}</span>
                    <span className="block text-xs text-neutral-500">{item.hint}</span>
                  </span>
                </button>
              )))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}

// Filtres au-dessus de la liste. « À encaisser » = un paiement est attendu
// maintenant (voir cycleOf).
const FILTERS = [
  { key: 'toutes', label: 'Toutes', test: () => true },
  { key: 'encaisser', label: 'À encaisser', test: (s, c) => c.due },
  { key: 'essai', label: 'En essai', test: (s, c) => s.subscriptionStatus === 'essai' && !c.due },
  { key: 'payees', label: 'Payées', test: (s, c) => s.subscriptionStatus === 'a_jour' && !c.due },
  { key: 'illimite', label: 'Illimité', test: (s) => s.subscriptionStatus === 'illimite' },
];

// Grille partagée : en colonnes sur grand écran, en carte sur téléphone.
const ROW_GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-6 gap-y-3 [grid-template-areas:'station_amount'_'cycle_cycle'_'actions_actions'] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)_minmax(0,1.5fr)_13rem] lg:items-center lg:[grid-template-areas:'station_amount_cycle_actions']";

export default function Billing() {
  useDocumentTitle('Facturation');
  const {
    stations, PLANS, markSubscriptionOverdue, sendBillingReminder, grantUnlimitedAccess, revokeUnlimitedAccess, grantFreeAccess,
    recordStationPayment, getTrialDataCounts, purgeTrialData,
    stationRenewalPayments, confirmRenewalPayment, rejectRenewalPayment,
  } = useSuperAdminState();
  const [reminded, setReminded] = useState({});
  const [freeAccessFor, setFreeAccessFor] = useState(null); // station à qui offrir un accès gratuit
  const [paymentFor, setPaymentFor] = useState(null); // station dont on encaisse l'abonnement
  const [purgeFor, setPurgeFor] = useState(null); // station dont on vide les données d'essai
  const pendingRenewals = stationRenewalPayments.filter((p) => p.status === 'PENDING');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('toutes');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const now = new Date();
  const cycles = Object.fromEntries(stations.map((s) => [s.id, cycleOf(s, now)]));
  const filterCounts = Object.fromEntries(FILTERS.map((f) => [f.key, stations.filter((s) => f.test(s, cycles[s.id])).length]));
  const activeFilter = FILTERS.find((f) => f.key === filter) || FILTERS[0];
  const filteredStations = stations.filter((s) =>
    activeFilter.test(s, cycles[s.id])
    && (s.name.toLowerCase().includes(search.toLowerCase()) || (s.city || '').toLowerCase().includes(search.toLowerCase()))
  );
  useEffect(() => { setPage(1); }, [search, filter]);
  const totalPages = Math.max(1, Math.ceil(filteredStations.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedStations = filteredStations.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // MRR = uniquement les abonnements RÉELLEMENT validés (paiement à jour) —
  // hors essais gratuits, impayés et accès illimités offerts. Définition
  // partagée avec Vue d'ensemble / Analytique / Bilan (lib/platformRevenue.js).
  const paidStations = validatedStations(stations);
  const mrr = validatedMRR(stations, PLANS);
  const modMrr = modulesMRR(stations);
  const trialCount = stations.filter(s => s.subscriptionStatus === 'essai').length;
  const overdueCount = stations.filter(s => s.subscriptionStatus === 'en_retard').length;
  const overdueAmount = stations
    .filter(s => s.subscriptionStatus === 'en_retard')
    .reduce((sum, s) => sum + stationPrice(PLANS, s), 0);

  const handleRemind = (id) => {
    sendBillingReminder(id);
    setReminded(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setReminded(prev => ({ ...prev, [id]: false })), 3000);
  };

  const amountCell = (s) => {
    const price = stationPrice(PLANS, s);
    const plan = PLANS[s.plan]?.label || s.plan;
    if (s.subscriptionStatus === 'illimite') {
      return (
        <div className="min-w-0 text-right lg:text-left">
          <p className="whitespace-nowrap font-display text-lg font-semibold text-violet-300">
            Offert <s className="font-sans text-xs font-medium tabular-nums text-neutral-500">{price.toLocaleString('fr-FR')} FCFA</s>
          </p>
          <p className="text-xs text-neutral-500">Offre {plan}</p>
        </div>
      );
    }
    return (
      <div className="min-w-0 text-right lg:text-left">
        <p className="whitespace-nowrap font-display text-lg font-semibold tabular-nums text-white">
          {price.toLocaleString('fr-FR')} <span className="font-sans text-xs font-medium text-neutral-500">FCFA/mois</span>
        </p>
        <p className="text-xs text-neutral-500">Offre {plan}</p>
      </div>
    );
  };

  const menuItems = (s) => [
    { icon: InfinityIcon, label: 'Passer en accès illimité', hint: 'Gratuit, sans échéance', onSelect: () => { if (window.confirm(`Donner un accès illimité (gratuit) à ${s.name} ?`)) grantUnlimitedAccess(s.id); } },
    { icon: Gift, label: 'Offrir un accès gratuit', hint: '1 semaine, 10 jours ou 1 mois', onSelect: () => setFreeAccessFor(s) },
    { separator: true },
    { icon: Bell, label: 'Envoyer une relance', hint: 'Rappel de paiement à la station', onSelect: () => handleRemind(s.id) },
    ...(s.subscriptionStatus !== 'en_retard'
      ? [{ icon: AlertTriangle, label: 'Marquer comme impayé', hint: 'La station passe en impayé', onSelect: () => markSubscriptionOverdue(s.id) }]
      : []),
    ...(canPurgeTrial(s)
      ? [{ separator: true }, { icon: Eraser, label: "Vider les données d'essai", hint: 'Efface les saisies faites pendant le test', danger: true, onSelect: () => setPurgeFor(s) }]
      : []),
  ];

  const renderRow = (s) => {
    const c = cycles[s.id];
    const t = TONES[c.tone];
    const second = s.city || (s.joinedAt ? `Inscrite le ${shortDate(s.joinedAt)}` : '');
    return (
      <li
        key={s.id}
        className={`relative px-4 py-4 transition-colors hover:bg-white/[0.02] lg:px-6 lg:py-[18px] ${ROW_GRID}`}
        style={c.due ? { backgroundImage: `linear-gradient(90deg, rgba(${t.rgb},0.06), transparent 45%)` } : undefined}
      >
        {c.due && <span aria-hidden="true" className={`absolute bottom-3 left-0 top-3 w-[3px] rounded-r-full ${t.dot}`} />}

        <div className="flex min-w-0 items-center gap-3 [grid-area:station]">
          <StationMark station={s} />
          <div className="min-w-0">
            <p className="line-clamp-2 break-words font-display text-[15px] font-semibold leading-snug text-white" title={s.name}>{s.name}</p>
            {second && <p className="truncate text-xs text-neutral-500">{second}</p>}
          </div>
        </div>

        <div className="[grid-area:amount]">{amountCell(s)}</div>

        <div className="min-w-0 [grid-area:cycle] max-lg:rounded-xl max-lg:bg-white/[0.025] max-lg:p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-white">
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${t.dot}`}
              style={c.due ? { boxShadow: `0 0 0 4px rgba(${t.rgb},0.16)` } : undefined}
            />
            {c.title}
          </p>
          <p className={`mt-0.5 pl-4 text-xs ${c.due ? t.text : 'text-neutral-400'}`}>{c.detail}</p>
          <div className="pl-4"><CycleGauge gauge={c.gauge} tone={c.tone} /></div>
          {reminded[s.id] && (
            <p role="status" className="mt-1.5 flex items-center gap-1 pl-4 text-xs font-medium text-emerald-300">
              <Check className="h-3.5 w-3.5" /> Relance envoyée
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 [grid-area:actions] lg:justify-end">
          {s.subscriptionStatus === 'illimite' ? (
            <button
              type="button"
              onClick={() => { if (window.confirm(`Retirer l'accès illimité de ${s.name} et revenir à un abonnement normal ?`)) revokeUnlimitedAccess(s.id); }}
              className={`${BTN_QUIET} max-lg:flex-1`}
            >
              <InfinityIcon className="h-4 w-4 text-violet-300" /> Retirer l'illimité
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPaymentFor(s)}
                className={`${c.due ? BTN_STRONG : BTN_QUIET} max-lg:flex-1`}
                title="Paiement reçu en espèces, Wave ou Orange Money : activer un ou plusieurs mois"
              >
                <Banknote className="h-4 w-4" /> Encaisser
              </button>
              <ManageMenu label={`Gérer ${s.name}`} items={menuItems(s)} />
            </>
          )}
        </div>
      </li>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto relative z-10">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2 tracking-tight">Facturation & <span className="text-purple-400">Abonnements</span></h1>
        <p className="text-neutral-400 text-lg">Suivez les revenus récurrents de la plateforme et les impayés.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-10">
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-purple-500/10 w-fit mb-4"><CreditCard className="w-6 h-6 text-purple-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Revenu Récurrent Mensuel</p>
          <h3 className="text-3xl font-bold text-white">{mrr.toLocaleString('fr-FR')} FCFA</h3>
          <p className="text-xs text-neutral-500 mt-1">
            {paidStations.length} abonnement{paidStations.length > 1 ? 's' : ''} validé{paidStations.length > 1 ? 's' : ''}
            {modMrr > 0 ? ` · +${modMrr.toLocaleString('fr-FR')} FCFA modules` : ''}
          </p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-emerald-500/10 w-fit mb-4"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Abonnements validés</p>
          <h3 className="text-3xl font-bold text-white">{paidStations.length}</h3>
          <p className="text-xs text-neutral-500 mt-1">{trialCount} en essai gratuit</p>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-red-500/10 w-fit mb-4"><AlertTriangle className="w-6 h-6 text-red-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Stations en impayé</p>
          <h3 className="text-3xl font-bold text-white">{overdueCount}</h3>
        </div>
        <div className="glass-card rounded-2xl p-6 border border-white/5 bg-white/[0.02]">
          <div className="p-3 rounded-xl bg-orange-500/10 w-fit mb-4"><Clock className="w-6 h-6 text-orange-400" /></div>
          <p className="text-neutral-400 text-sm font-medium mb-1">Montant impayé en attente</p>
          <h3 className="text-3xl font-bold text-white">{overdueAmount.toLocaleString('fr-FR')} FCFA</h3>
        </div>
      </div>

      {pendingRenewals.length > 0 && (
        <div className="glass-card rounded-2xl overflow-hidden border border-blue-500/20 bg-blue-500/[0.03] mb-10">
          <div className="px-6 py-4 border-b border-blue-500/20 flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Demandes de renouvellement en attente</h2>
          </div>
          <div className="divide-y divide-white/5">
            {pendingRenewals.map((p) => (
              <div key={p.id} className="p-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-bold text-white">{p.stationName || 'Sans nom'}</p>
                  <p className="text-sm text-neutral-400">
                    {p.plan} — {(p.amount || 0).toLocaleString('fr-FR')} FCFA via {p.method || '—'}
                    {p.reference ? ` (${p.reference})` : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmRenewalPayment(p.id)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg transition-colors text-xs font-bold"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Confirmer
                  </button>
                  <button
                    onClick={() => { if (window.confirm(`Rejeter la demande de renouvellement de ${p.stationName} ?`)) rejectRenewalPayment(p.id); }}
                    className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors text-xs font-bold"
                  >
                    <XCircle className="w-4 h-4" /> Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stations.length > 0 && (
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full lg:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
            <input
              type="search"
              placeholder="Rechercher une station ou une ville"
              aria-label="Rechercher une station ou une ville"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] pl-9 pr-3 text-sm text-white placeholder:text-neutral-500 transition-colors focus:border-white/25 focus:bg-white/[0.05] focus:outline-none"
            />
          </div>
          <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:px-0 [&::-webkit-scrollbar]:hidden">
            <div className="inline-flex gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-1" role="group" aria-label="Filtrer les stations">
              {FILTERS.map((f) => {
                const active = f.key === activeFilter.key;
                const count = filterCounts[f.key];
                return (
                  <button
                    key={f.key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(f.key)}
                    className={`relative flex h-8 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${active ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="billing-filter"
                        transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }}
                        className="absolute inset-0 rounded-lg bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      />
                    )}
                    <span className="relative">{f.label}</span>
                    <span className={`relative text-xs tabular-nums ${f.key === 'encaisser' && count > 0 ? 'font-semibold text-red-300' : 'text-neutral-500'}`}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {filteredStations.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-white/10 p-12 text-center">
          <CreditCard className="mx-auto mb-4 h-12 w-12 text-neutral-600" />
          <h3 className="mb-2 text-xl font-bold text-white">
            {stations.length === 0 ? 'Aucune station à facturer' : search ? 'Aucune station trouvée' : 'Aucune station dans ce filtre'}
          </h3>
          <p className="text-neutral-400">
            {stations.length === 0 ? "Ajoutez des stations partenaires depuis l'onglet Stations." : search ? 'Ajustez votre recherche.' : 'Rien à traiter ici pour le moment.'}
          </p>
          {stations.length > 0 && activeFilter.key !== 'toutes' && (
            <button type="button" onClick={() => setFilter('toutes')} className={`${BTN_QUIET} mt-5`}>Voir toutes les stations</button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-neutral-950/70 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_24px_60px_-30px_rgba(0,0,0,0.8)]">
          <div aria-hidden="true" className={`hidden border-b border-white/[0.07] px-6 py-3 text-xs font-medium text-neutral-500 lg:grid ${ROW_GRID}`}>
            <span className="[grid-area:station]">Station</span>
            <span className="[grid-area:amount]">Abonnement</span>
            <span className="[grid-area:cycle]">Période en cours</span>
            <span className="[grid-area:actions] text-right">Actions</span>
          </div>
          <ul className="divide-y divide-white/[0.06]">
            {paginatedStations.map(renderRow)}
          </ul>
          <Pagination
            page={currentPage}
            pageSize={pageSize}
            totalItems={filteredStations.length}
            onPageChange={setPage}
            onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
          />
        </div>
      )}
      <AnimatePresence>
        {freeAccessFor && (
          <FreeAccessModal
            station={freeAccessFor}
            planLabel={PLANS[freeAccessFor.plan]?.label || freeAccessFor.plan}
            onClose={() => setFreeAccessFor(null)}
            onGrant={grantFreeAccess}
          />
        )}
        {paymentFor && (
          <PaymentModal
            station={paymentFor}
            planLabel={PLANS[paymentFor.plan]?.label || paymentFor.plan}
            monthlyPrice={stationPrice(PLANS, paymentFor)}
            onClose={() => setPaymentFor(null)}
            onRecord={recordStationPayment}
            onCountTrial={getTrialDataCounts}
            onPurgeTrial={purgeTrialData}
          />
        )}
        {purgeFor && (
          <PurgeTrialModal
            station={purgeFor}
            onClose={() => setPurgeFor(null)}
            onCount={getTrialDataCounts}
            onPurge={purgeTrialData}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
