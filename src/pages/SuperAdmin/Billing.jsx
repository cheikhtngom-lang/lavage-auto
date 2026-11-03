import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, CheckCircle2, AlertTriangle, Bell, Clock, Infinity as InfinityIcon, XCircle, Smartphone, Search, Gift, X, Banknote, Eraser, Loader2 } from 'lucide-react';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { trialDaysRemaining, trialProgressPercent, trialUrgency, trialLabel, FREE_ACCESS_OPTIONS, freeAccessPlan } from '../../lib/stationTrial';
import { stationDueDate } from '../../lib/subscriptionReminders';
import { validatedMRR, validatedStations, modulesMRR, stationPrice } from '../../lib/platformRevenue';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import Pagination from '../../components/ui/Pagination';

const SUB_STATUS = {
  a_jour: { label: 'À jour', className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  en_retard: { label: 'Impayé', className: 'bg-red-500/10 text-red-400 border-red-500/20' },
  essai: { label: 'Essai gratuit', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  illimite: { label: 'Accès illimité', className: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  a_payer: { label: 'En attente de paiement', className: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
};

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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filteredStations = stations.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) || (s.city || '').toLowerCase().includes(search.toLowerCase())
  );
  useEffect(() => { setPage(1); }, [search]);
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

  const renderAmount = (s) => (s.subscriptionStatus === 'illimite'
    ? <span className="text-purple-400 font-medium">Gratuit</span>
    : `${stationPrice(PLANS, s).toLocaleString('fr-FR')} FCFA`);

  const renderStatus = (s) => (
    <>
      <span className={`text-xs font-medium px-3 py-1 rounded-full border ${SUB_STATUS[s.subscriptionStatus]?.className}`}>
        {s.subscriptionStatus === 'essai' ? trialLabel(!!s.trialStartedAt) : (SUB_STATUS[s.subscriptionStatus]?.label || s.subscriptionStatus)}
      </span>
      {s.subscriptionStatus === 'essai' && s.trialEndsAt && (() => {
        const remaining = trialDaysRemaining(s.trialEndsAt);
        const percent = trialProgressPercent(s.trialEndsAt, s.trialStartedAt || s.joinedAt);
        const urgency = trialUrgency(s.trialEndsAt, s.trialStartedAt || s.joinedAt);
        const textClass = urgency === 'danger' ? 'text-red-400' : urgency === 'warning' ? 'text-orange-400' : 'text-neutral-500';
        const barClass = urgency === 'danger' ? 'bg-red-400' : urgency === 'warning' ? 'bg-orange-400' : 'bg-emerald-400';
        return (
          <div className="mt-2 max-w-[140px]">
            <p className={`text-xs mb-1 ${textClass}`}>
              {remaining <= 0 ? (s.trialStartedAt ? 'Accès gratuit terminé' : 'Essai terminé') : `${remaining} j restants`}
            </p>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div className={`h-full rounded-full ${barClass}`} style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      })()}
    </>
  );

  // « À jour » ne repasse jamais seul en impayé : une échéance dépassée est
  // signalée ici, pour encaisser le mois suivant.
  const renderDue = (s) => {
    const due = stationDueDate(s);
    if (!due) return <span className="text-neutral-500">—</span>;
    const late = isPastDue(s);
    return (
      <span className={late ? 'text-red-400' : 'text-neutral-400'}>
        {late && <span className="block text-[11px] font-semibold uppercase tracking-wide text-red-400">Échéance dépassée</span>}
        {new Date(due).toLocaleDateString('fr-FR')}
      </span>
    );
  };

  const iconBtn = 'p-2 bg-white/5 text-neutral-400 rounded-lg transition-colors';
  const renderActions = (s, alignEnd = false) => (
    <div className={`flex flex-wrap items-center gap-2 ${alignEnd ? 'justify-end' : ''}`}>
      {s.subscriptionStatus === 'illimite' ? (
        <button
          onClick={() => { if (window.confirm(`Retirer l'accès illimité de ${s.name} et revenir à un abonnement normal ?`)) revokeUnlimitedAccess(s.id); }}
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 rounded-lg transition-colors text-xs font-bold"
          title="Retirer l'accès illimité"
        >
          <InfinityIcon className="w-4 h-4" /> Retirer l'illimité
        </button>
      ) : (
        <>
          <button
            onClick={() => setPaymentFor(s)}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 rounded-lg transition-colors text-xs font-bold"
            title="Paiement reçu en espèces, Wave ou Orange Money : activer un ou plusieurs mois"
          >
            <Banknote className="w-4 h-4" /> Encaisser
          </button>
          <button
            onClick={() => { if (window.confirm(`Donner un accès illimité (gratuit) à ${s.name} ?`)) grantUnlimitedAccess(s.id); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 rounded-lg transition-colors text-xs font-bold"
            title="Donner un accès illimité (gratuit)"
          >
            <InfinityIcon className="w-4 h-4" /> Illimité
          </button>
          {canPurgeTrial(s) && (
            <button
              onClick={() => setPurgeFor(s)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded-lg transition-colors text-xs font-bold"
              title="Effacer les données saisies pendant l'essai"
            >
              <Eraser className="w-4 h-4" /> Vider l'essai
            </button>
          )}
          {s.subscriptionStatus !== 'en_retard' && (
            <button onClick={() => markSubscriptionOverdue(s.id)} className={`${iconBtn} hover:bg-red-500/20 hover:text-red-400`} title="Marquer comme impayé" aria-label={`Marquer ${s.name} comme impayé`}>
              <AlertTriangle className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => handleRemind(s.id)} className={`${iconBtn} hover:bg-blue-500/20 hover:text-blue-400`} title="Envoyer une relance" aria-label={`Relancer ${s.name}`}>
            <Bell className="w-4 h-4" />
          </button>
          {reminded[s.id] && <span className="text-xs text-blue-400">Envoyée ✓</span>}
          <button onClick={() => setFreeAccessFor(s)} className={`${iconBtn} hover:bg-purple-500/20 hover:text-purple-400`} title="Offrir un accès gratuit (1 semaine, 10 jours, 1 mois)" aria-label={`Offrir un accès gratuit à ${s.name}`}>
            <Gift className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  );

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
        <div className="relative w-full md:w-1/3 mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
          <input
            type="text"
            placeholder="Rechercher une station ou une ville..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-neutral-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
          />
        </div>
      )}

      {filteredStations.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10">
          <CreditCard className="w-14 h-14 text-neutral-600 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">{stations.length === 0 ? 'Aucune station à facturer' : 'Aucune station trouvée'}</h3>
          <p className="text-neutral-400">{stations.length === 0 ? "Ajoutez des stations partenaires depuis l'onglet Stations." : 'Ajustez votre recherche.'}</p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl overflow-hidden border border-white/5 bg-white/[0.02]">
          {/* Téléphone et tablette en portrait : une carte par station, actions
              visibles sans défilement horizontal (dans le tableau, elles
              étaient hors de l'écran, à droite). */}
          <ul className="lg:hidden divide-y divide-white/5">
            {paginatedStations.map((s) => (
              <li key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className="font-bold text-white truncate">{s.name}</p>
                    <p className="text-xs text-neutral-500">{[s.city, PLANS[s.plan]?.label || s.plan].filter(Boolean).join(' · ')}</p>
                  </div>
                  <p className="text-sm text-neutral-300 whitespace-nowrap">{renderAmount(s)}</p>
                </div>
                <div className="flex flex-wrap items-start gap-x-4 gap-y-2 mb-3">
                  <div>{renderStatus(s)}</div>
                  <div className="text-xs">{renderDue(s)}</div>
                </div>
                {renderActions(s)}
              </li>
            ))}
          </ul>

          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="p-5 font-semibold text-neutral-400">Station</th>
                  <th className="p-5 font-semibold text-neutral-400">Plan</th>
                  <th className="p-5 font-semibold text-neutral-400">Montant</th>
                  <th className="p-5 font-semibold text-neutral-400">Statut</th>
                  <th className="p-5 font-semibold text-neutral-400">Prochaine échéance</th>
                  <th className="p-5 font-semibold text-neutral-400 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedStations.map((s) => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="p-5">
                      <p className="font-bold text-white">{s.name}</p>
                      <p className="text-xs text-neutral-500">{s.city}</p>
                    </td>
                    <td className="p-5">
                      <span className="bg-white/5 text-neutral-300 px-3 py-1 rounded-md text-sm border border-white/10">{PLANS[s.plan]?.label || s.plan}</span>
                    </td>
                    <td className="p-5 text-neutral-300">{renderAmount(s)}</td>
                    <td className="p-5">{renderStatus(s)}</td>
                    <td className="p-5 text-sm">{renderDue(s)}</td>
                    <td className="p-5">{renderActions(s, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
