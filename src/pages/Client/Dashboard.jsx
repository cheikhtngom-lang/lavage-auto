import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '../../components/ui/Badge';
import { StarRatingDisplay, StarRatingInput } from '../../components/ui/StarRating';
import { Car, Receipt, ArrowRight, Droplets, MapPin, Sparkles, Clock, Bell, X, Gift, Star, Download, Megaphone, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { useClientAccount } from '../../hooks/useClientAccount';
import {
  getItemPosition, estimateItemWaitTime, pushBackReservation,
  addStationReview, hasClientReviewedTransaction, getStationDurationConfig, getStationOperationalProfile, getStationPromo,
} from '../../lib/stationData';
import { isBannerActive } from '../../lib/promoDefaults';
import { deriveAdStatus } from '../../lib/ads';
import { downloadReceiptPdf } from '../../lib/receipt';
import { hasSeenTip, markTipSeen } from '../../lib/adoptionTips';
import { getLoginCount } from '../../lib/accounts';
import Pagination from '../../components/ui/Pagination';

const LOYALTY_DEFAULT_THRESHOLD = 5;

function formatTxDate(iso) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${time}`;
  return `${d.toLocaleDateString('fr-FR')}, ${time}`;
}

// Une carte de statut par véhicule actif — un client peut désormais avoir
// jusqu'à MAX_ACTIVE_VEHICLES_PER_CLIENT réservations en même temps (voir
// lib/stationData.js), chacune avec son propre décompte de lavage / position
// dans la file, donc chaque carte gère son propre minuteur indépendamment.
// Choix proposés au clic sur "Je vais être en retard" — 2/3/4 rangs, ou la
// dernière place (positions=999 : voir pushBackReservation/stationData.js,
// se cale automatiquement sur la dernière place si la file est plus courte).
const PUSH_BACK_OPTIONS = [
  { positions: 2, label: '2 places' },
  { positions: 3, label: '3 places' },
  { positions: 4, label: '4 places' },
  { positions: 999, label: 'Dernière place' },
];

function LiveStatusCard({ reservation, onPushBack }) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [showPushBack, setShowPushBack] = useState(false);
  const [pushBackLoading, setPushBackLoading] = useState(false);
  const [pushBackError, setPushBackError] = useState('');

  const handlePushBack = async (positions) => {
    setPushBackLoading(true);
    setPushBackError('');
    try {
      await onPushBack(reservation.item.id, positions);
      setShowPushBack(false);
    } catch (err) {
      setPushBackError(err.message || 'Impossible de reculer votre place, réessayez.');
    } finally {
      setPushBackLoading(false);
    }
  };

  useEffect(() => {
    if (!reservation.isWashing) {
      setRemainingSeconds(0);
      setTotalSeconds(0);
      return;
    }
    const durationConfig = getStationDurationConfig(reservation.station.id);
    const cat = reservation.item.category || 'Particulier';
    const minutes = durationConfig?.[cat]?.[reservation.item.service] ?? 30;
    const total = Math.max(0, Math.round(minutes * 60));
    setTotalSeconds(total);

    const start = new Date(reservation.item.startedAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      setRemainingSeconds(Math.max(0, total - elapsed));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [reservation.isWashing, reservation.item.id, reservation.item.startedAt, reservation.station.id]);

  const estimatedWait = !reservation.isWashing ? estimateItemWaitTime(reservation.station.id, reservation.item.createdAt) : 0;

  return (
    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }} className="animated-border-card">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 to-emerald-500/30 blur-2xl z-0"></div>
      <div className="animated-border-card-content p-8 relative flex flex-col gap-6 bg-neutral-950/80 backdrop-blur-3xl">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <Badge className="mb-4 bg-blue-500/20 text-blue-400 border-blue-500/30 px-3 py-1">{reservation.item.vehicle}</Badge>
            <h3 className="text-xl font-bold mb-2 flex items-center">
              <MapPin className="w-4 h-4 mr-2 text-emerald-400" />
              {reservation.station.name}
            </h3>
            <p className="text-neutral-400 text-sm">{reservation.item.service}</p>
          </div>

          <div className="relative flex justify-center items-center">
            {reservation.isWashing ? (
              <div className="relative flex items-center justify-center">
                <svg className="w-32 h-32 transform -rotate-90">
                  <circle cx="64" cy="64" r="56" className="stroke-white/10" strokeWidth="7" fill="none" />
                  <motion.circle cx="64" cy="64" r="56" className={totalSeconds > 0 && remainingSeconds <= 0 ? 'stroke-orange-400' : 'stroke-emerald-400'} strokeWidth="7" fill="none" strokeLinecap="round"
                    initial={{ strokeDasharray: "352", strokeDashoffset: "352" }}
                    animate={{ strokeDashoffset: totalSeconds > 0 ? 352 - (352 * (totalSeconds - remainingSeconds)) / totalSeconds : 352 }} transition={{ duration: 0.5 }} />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <Droplets className={`w-6 h-6 mb-1.5 ${remainingSeconds <= 0 && totalSeconds > 0 ? 'text-orange-400' : 'text-emerald-400 animate-bounce'}`} />
                  <span className="text-xl font-bold text-white font-mono">
                    {String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:{String(remainingSeconds % 60).padStart(2, '0')}
                  </span>
                  <span className={`text-[10px] uppercase tracking-widest mt-1 ${remainingSeconds <= 0 && totalSeconds > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>
                    {remainingSeconds <= 0 && totalSeconds > 0 ? 'Finalisation...' : 'Temps restant'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-32 h-32 rounded-full border-8 border-blue-500/20 bg-black/40 flex flex-col items-center justify-center shadow-[0_0_50px_rgba(59,130,246,0.2)]">
                <span className="text-3xl font-bold text-white">{reservation.position}</span>
                <span className="text-[10px] text-neutral-400 uppercase tracking-widest mt-1">Avant vous</span>
                <span className="text-blue-400 font-medium text-xs mt-1">~{estimatedWait} min</span>
              </div>
            )}
          </div>
        </div>

        {/* Report de place — réservé aux clients abonnés de CETTE station,
            uniquement tant qu'on attend encore (pas de sens une fois lavage lancé). */}
        {!reservation.isWashing && reservation.hasSubscription && (
          <div className="pt-6 border-t border-white/10">
            {!showPushBack ? (
              <button onClick={() => setShowPushBack(true)}
                className="flex items-center gap-2 text-sm font-medium text-amber-400 hover:text-amber-300 transition-colors">
                <Clock className="w-4 h-4" /> Je vais être en retard — reculer ma place
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-neutral-400 text-sm">Avantage abonné {reservation.station.name} : reculez votre place sans perdre votre tour.</p>
                <div className="flex flex-wrap gap-2">
                  {PUSH_BACK_OPTIONS.map((opt) => (
                    <button key={opt.positions} type="button" disabled={pushBackLoading} onClick={() => handlePushBack(opt.positions)}
                      className="px-4 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                      {opt.label}
                    </button>
                  ))}
                  <button type="button" disabled={pushBackLoading} onClick={() => { setShowPushBack(false); setPushBackError(''); }}
                    className="px-4 py-2 rounded-lg text-neutral-400 hover:text-white text-sm font-medium transition-colors">
                    Annuler
                  </button>
                </div>
                {pushBackLoading && <p className="text-neutral-500 text-xs">Mise à jour de votre position...</p>}
                {pushBackError && <p className="text-red-400 text-xs">{pushBackError}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function ClientOverview() {
  const navigate = useNavigate();
  const { account, reservations: myReservations, myTransactions: rawTransactions, dismissAd, myStationSubscriptions, refreshActivity } = useClientAccount();
  const { stations: registry, stationAds } = useSuperAdminState();

  const myName = account?.name || '';
  const firstName = myName.split(' ')[0] || 'là';
  const activeStations = (registry || []).filter(s => s.status !== 'suspendue');
  // Compte jamais utilisé (aucune réservation passée ou en cours) — sert à distinguer
  // le message "bienvenue, réservez votre premier lavage" de l'état vide générique
  // qu'un client existant verrait simplement entre deux lavages. Plafonné à 3
  // connexions (voir [[design_onboarding_backlog]]) : au-delà, même un compte
  // jamais utilisé retombe sur le message neutre — pas de relance perpétuelle.
  const isBrandNewAccount = myReservations.length === 0 && rawTransactions.length === 0 && getLoginCount('automobiliste', account?.id) <= 3;

  // Un client peut avoir plusieurs véhicules actifs en même temps (jusqu'à
  // MAX_ACTIVE_VEHICLES_PER_CLIENT — voir lib/stationData.js), donc on suit un
  // tableau de réservations plutôt qu'une seule. `myReservations` (déjà les
  // siennes, via RLS) vient de useClientAccount, qui le rafraîchit toutes les
  // 8s — la position/l'attente elles restent calculées ici via le cache
  // anonymisé (stationData.js), puisqu'elles dépendent des AUTRES clients.
  const reservations = myReservations.map((r) => ({
    station: { id: r.station_id, name: r.stations?.name || 'Station' },
    item: { id: r.id, vehicle: r.vehicle_label, service: r.service, category: r.category, startedAt: r.started_at, createdAt: r.created_at },
    isWashing: r.status === 'en_cours',
    position: r.status === 'en_cours' ? 0 : getItemPosition(r.station_id, r.created_at),
    // Le report de place (voir LiveStatusCard) n'est proposé qu'aux clients
    // ayant un abonnement actif dans CETTE station précise (add_client_push_back.sql
    // vérifie la même condition côté serveur — ce booléen ne fait que décider
    // si on montre le bouton, jamais la seule barrière réelle).
    hasSubscription: (myStationSubscriptions || []).some((sub) => sub.station_id === r.station_id),
  }));

  const handlePushBack = async (reservationId, positions) => {
    await pushBackReservation(reservationId, positions);
    refreshActivity();
  };
  const [lastUpdated, setLastUpdated] = useState(Date.now());
  const [notifStatus, setNotifStatus] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const prevSignatures = useRef({}); // itemId -> signature, pour détecter les changements par véhicule
  const [reviewingTx, setReviewingTx] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewedFlags, setReviewedFlags] = useState({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const garageTipId = account?.id ? `garage_${account.id}` : null;
  const [showGarageTip, setShowGarageTip] = useState(false);
  const dismissGarageTip = () => { markTipSeen(garageTipId); setShowGarageTip(false); };

  useEffect(() => { setLastUpdated(Date.now()); }, [myReservations]);

  // Notification navigateur sur les changements significatifs, par véhicule :
  // position qui devient 1 ou 2, ou passage en lavage. On ignore les absences
  // transitoires de réservation (ex: la station déplace l'entrée file→en cours
  // en deux écritures successives) — seul un item.id nouveau réinitialise le suivi.
  useEffect(() => {
    if (notifStatus !== 'granted') return;
    reservations.forEach((res) => {
      const itemId = res.item.id;
      const signature = `${res.station.id}:${res.isWashing ? 'washing' : res.position}`;
      const prev = prevSignatures.current[itemId];

      if (prev == null) {
        prevSignatures.current[itemId] = signature;
        return;
      }
      if (signature !== prev) {
        if (res.isWashing) {
          new Notification('Votre lavage a commencé !', { body: `${res.station.name} s'occupe de ${res.item.vehicle}.` });
        } else if (res.position <= 2) {
          new Notification('C\'est bientôt votre tour', { body: `Plus que ${res.position} avant ${res.item.vehicle} chez ${res.station.name}.` });
        }
        prevSignatures.current[itemId] = signature;
      }
    });
  }, [reservations, notifStatus]);

  const enableNotifications = () => {
    if (typeof Notification === 'undefined') return;
    Notification.requestPermission().then(setNotifStatus);
  };

  const myTransactions = rawTransactions.map((tx) => ({
    id: tx.id, date: formatTxDate(tx.created_at), client: tx.client_name, vehicle: tx.vehicle_label,
    service: tx.service, method: tx.method, amount: tx.amount, stationId: tx.station_id, stationName: tx.stations?.name || 'Station',
  }));
  // Astuce "adoption" (voir [[design_onboarding_backlog]]) : une fois le premier
  // lavage payé effectué, on suggère le Garage pour accélérer les prochaines
  // réservations — jamais montrée avant, jamais reproposée une fois vue.
  useEffect(() => {
    if (myTransactions.length > 0 && !hasSeenTip(garageTipId)) setShowGarageTip(true);
  }, [myTransactions.length, garageTipId]);

  const totalPages = Math.max(1, Math.ceil(myTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedTransactions = myTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Fidélité : progression par station où le client a au moins un lavage payé.
  const loyaltyByStation = {};
  myTransactions.forEach(tx => {
    loyaltyByStation[tx.stationId] = (loyaltyByStation[tx.stationId] || 0) + 1;
  });
  const loyaltyEntries = Object.entries(loyaltyByStation).map(([stationId, count]) => {
    const station = activeStations.find(s => String(s.id) === String(stationId));
    if (!station) return null;
    const threshold = station.loyaltyThreshold || LOYALTY_DEFAULT_THRESHOLD;
    const inCycle = count % threshold === 0 ? threshold : count % threshold;
    const eligible = count > 0 && count % threshold === 0;
    return { station, count, threshold, inCycle, eligible };
  }).filter(Boolean).sort((a, b) => b.count - a.count);

  // Publicités actives (broadcast plateforme, payantes — voir Admin > Passer
  // une pub) : visibles par TOUS les automobilistes, mais un client peut en
  // ignorer une (dismissAd), elle disparaît alors pour lui uniquement
  // (profiles.dismissed_ad_ids), pas pour les autres clients.
  const dismissedAdIds = account?.dismissedAdIds || [];
  const activeAds = stationAds.filter(a => deriveAdStatus(a) === 'ACTIVE' && !dismissedAdIds.includes(a.id));

  // Offres des stations où le client a déjà une relation (lavage payé au
  // moins une fois, ou véhicule actuellement dans une file) — contrairement
  // aux publicités ci-dessus, ce n'est PAS un broadcast plateforme : le
  // bandeau promo gratuit (Admin > Promotions) n'est montré ici qu'aux
  // clients déjà passés par CETTE station.
  const historyStationIds = new Set([...Object.keys(loyaltyByStation), ...reservations.map(r => String(r.station.id))]);
  const promoOffers = [...historyStationIds].map(id => {
    const station = activeStations.find(s => String(s.id) === id);
    const promo = station ? getStationPromo(id) : null;
    if (!station || !isBannerActive(promo)) return null;
    return { stationId: id, stationName: station.name, message: promo.banner.message };
  }).filter(Boolean);

  const openReview = (tx) => { setReviewingTx(tx); setReviewRating(0); setReviewComment(''); };
  const submitReview = async () => {
    if (!reviewingTx || reviewRating === 0 || !account) return;
    await addStationReview(reviewingTx.stationId, { clientId: account.id, rating: reviewRating, comment: reviewComment, transactionId: reviewingTx.id });
    setReviewedFlags(prev => ({ ...prev, [`${reviewingTx.stationId}:${reviewingTx.id}`]: true }));
    setReviewingTx(null);
  };
  const isReviewed = (tx) => reviewedFlags[`${tx.stationId}:${tx.id}`] || hasClientReviewedTransaction(tx.stationId, tx.id);

  const downloadTransactionReceipt = (tx) => {
    const profile = getStationOperationalProfile(tx.stationId);
    const address = profile?.quartier ? `${profile.quartier}${profile.region ? `, ${profile.region}` : ''}` : (profile?.address || '');
    downloadReceiptPdf({
      stationName: tx.stationName,
      stationAddress: address,
      stationPhone: profile?.phone || '',
      stationLogo: profile?.logo || null,
      stationCachet: profile?.cachet || null,
      receiptId: tx.id,
      date: tx.date,
      client: tx.client,
      method: tx.method,
      total: tx.amount,
      items: [{ label: tx.vehicle || tx.stationName, service: tx.service, amount: tx.amount }],
    });
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl relative z-10">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
        <h1 className="text-4xl font-bold mb-2 tracking-tight">Bonjour <span className="text-blue-400">{firstName}</span> 👋</h1>
        <p className="text-neutral-400 text-lg">Suivez le statut de vos véhicules en temps réel.</p>
      </motion.div>

      {notifStatus === 'default' && (
        <button onClick={enableNotifications} className="w-full mb-8 flex items-center gap-3 bg-blue-950/40 border border-blue-500/20 rounded-2xl px-5 py-4 hover:bg-blue-950/60 transition-colors text-left">
          <Bell className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <span className="text-sm text-blue-200/80"><strong className="text-blue-400">Activer les notifications</strong> pour être prévenu dès que votre lavage commence ou que c'est bientôt votre tour.</span>
        </button>
      )}

      {showGarageTip && (
        <div className="w-full mb-8 flex items-center gap-3 bg-emerald-950/30 border border-emerald-500/20 rounded-2xl px-5 py-4">
          <Car className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-200/80 flex-1">
            <strong className="text-emerald-400">Astuce :</strong> ajoutez vos véhicules dans <button onClick={() => navigate('/dashboard/garage')} className="underline hover:text-emerald-300">Mon Parking</button> pour réserver encore plus vite la prochaine fois.
          </span>
          <button onClick={dismissGarageTip} className="text-neutral-500 hover:text-white flex-shrink-0" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Publicités des stations (broadcast plateforme, ignorable) */}
      {activeAds.length > 0 && (
        <div className="mb-8 space-y-3">
          {activeAds.map((ad) => (
            <div key={ad.id} className="w-full flex items-center gap-4 bg-gradient-to-r from-amber-950/40 to-orange-950/20 border border-amber-500/20 rounded-2xl px-5 py-4">
              {ad.imageUrl && <img src={ad.imageUrl} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />}
              <Megaphone className="w-5 h-5 text-amber-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-100">{ad.message}</p>
                <p className="text-xs text-amber-400/70 mt-0.5">{ad.stationName}</p>
              </div>
              <button onClick={() => dismissAd(ad.id)} className="text-amber-400/60 hover:text-white flex-shrink-0" aria-label="Ignorer cette publicité">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Offres des stations où j'ai déjà réservé */}
      {promoOffers.length > 0 && (
        <div className="mb-8 space-y-3">
          {promoOffers.map((offer) => (
            <div key={offer.stationId} className="w-full flex items-center gap-3 bg-blue-950/30 border border-blue-500/20 rounded-2xl px-5 py-4">
              <Gift className="w-5 h-5 text-blue-400 flex-shrink-0" />
              <span className="text-sm text-blue-200/80 flex-1">
                <strong className="text-blue-400">{offer.stationName} :</strong> {offer.message}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Active Status Board */}
      <section className="mb-16">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-300 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-blue-400" />
            Statut en direct
          </h2>
          <span className="text-xs text-neutral-600">Mis à jour {Math.max(0, Math.round((Date.now() - lastUpdated) / 1000))}s</span>
        </div>

        {(reservations.length > 0 || (myStationSubscriptions && myStationSubscriptions.length > 0)) ? (
          <div className="grid grid-cols-1 gap-8">
            {myStationSubscriptions && myStationSubscriptions.length > 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  Vos Abonnements
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myStationSubscriptions.map(sub => {
                    const percentage = Math.max(0, Math.min(100, (sub.balance / sub.price) * 100));
                    return (
                      <div key={sub.id} className="p-4 rounded-xl bg-gradient-to-br from-emerald-900/20 to-black border border-emerald-500/20 flex flex-col justify-between">
                        <div>
                          <Badge className="mb-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">Abonnement Actif</Badge>
                          <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-400" />
                            {sub.stations?.name}
                          </h3>
                          <p className="text-xl font-black text-white mt-2">Solde: {(sub.balance || 0).toLocaleString()} FCFA</p>
                          <div className="w-full bg-black rounded-full h-4 mt-4 overflow-hidden border border-emerald-900/50 shadow-inner">
                            <div className="bg-emerald-400 h-full rounded-full transition-all duration-1000 shadow-[0_0_15px_rgba(52,211,153,0.5)]" style={{ width: `${percentage}%` }}></div>
                          </div>
                          <p className="text-neutral-400 text-xs mt-2">Vos lavages sont déduits de ce crédit.</p>
                        </div>
                        <button onClick={() => navigate(`/dashboard/stations?station=${sub.station_id}`)} className="mt-4 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 w-fit">
                          Réserver maintenant <ArrowRight className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {reservations.length > 0 ? (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  Lavage en cours
                </h2>
                <div className={`grid grid-cols-1 gap-6 ${reservations.length > 1 ? 'md:grid-cols-2' : ''}`}>
                  {reservations.map((res) => (
                    <LiveStatusCard key={res.item.id} reservation={res} onPushBack={handlePushBack} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10 hover:border-blue-500/30 transition-colors">
                <Car className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Aucun lavage en cours</h3>
                <p className="text-neutral-400 mb-6">Vous n'avez pas de véhicule dans la file d'attente actuellement.</p>
                <button onClick={() => navigate('/dashboard/stations')} className="btn-premium">
                  <span className="btn-premium-shimmer"></span>
                  <span className="btn-premium-content">Prendre Rendez-vous <ArrowRight className="w-4 h-4 ml-2" /></span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-12 text-center border-dashed border-2 border-white/10 hover:border-blue-500/30 transition-colors">
            <Car className="w-16 h-16 text-neutral-600 mx-auto mb-4" />
            {isBrandNewAccount ? (
              <>
                <h3 className="text-xl font-bold text-white mb-2">Bienvenue, {firstName} !</h3>
                <p className="text-neutral-400 mb-6">Réservez votre premier lavage en moins d'une minute : trouvez une station, choisissez votre véhicule, payez par Wave ou sur place.</p>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-white mb-2">Aucun lavage en cours</h3>
                <p className="text-neutral-400 mb-6">Vous n'avez pas de véhicule dans la file d'attente actuellement.</p>
              </>
            )}
            <button onClick={() => navigate('/dashboard/stations?onboarding=1')} className="btn-premium">
              <span className="btn-premium-shimmer"></span>
              <span className="btn-premium-content">{isBrandNewAccount ? 'Réserver mon premier lavage' : 'Prendre Rendez-vous'} <ArrowRight className="w-4 h-4 ml-2" /></span>
            </button>
          </div>
        )}
      </section>

      {/* Fidélité */}
      {loyaltyEntries.length > 0 && (
        <section className="mb-16">
          <h2 className="text-xl font-semibold mb-6 text-neutral-300 flex items-center"><Gift className="w-5 h-5 mr-2 text-blue-400" /> Fidélité</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {loyaltyEntries.map(({ station, count, threshold, inCycle, eligible }) => (
              <div key={station.id} className="glass-card rounded-2xl p-5 border border-white/5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white">{station.name}</h3>
                  <span className="text-xs text-neutral-500">{count} lavage{count > 1 ? 's' : ''} au total</span>
                </div>
                <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all" style={{ width: `${(inCycle / threshold) * 100}%` }} />
                </div>
                {eligible ? (
                  <p className="text-sm text-emerald-400 font-medium flex items-center gap-1.5"><Gift className="w-4 h-4" /> Lavage gratuit disponible — montrez cet écran à la station !</p>
                ) : (
                  <p className="text-sm text-neutral-400">{inCycle}/{threshold} lavages vers votre prochain lavage gratuit</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-neutral-300">Mes rendez-vous & Reçus</h2>
          {myTransactions.length > 0 && <span className="text-sm text-neutral-500">{myTransactions.length} transaction(s)</span>}
        </div>

        <div className="glass-card rounded-2xl overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                <th className="p-5 font-semibold text-neutral-400">Date & Station</th>
                <th className="p-5 font-semibold text-neutral-400">Service</th>
                <th className="p-5 font-semibold text-neutral-400">Prix</th>
                <th className="p-5 font-semibold text-neutral-400">Statut</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Reçu</th>
                <th className="p-5 font-semibold text-neutral-400 text-right">Avis</th>
              </tr>
            </thead>
            <tbody>
              {myTransactions.length === 0 ? (
                <tr><td colSpan="6" className="p-10 text-center text-neutral-500"><Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />Aucune transaction enregistrée pour le moment.</td></tr>
              ) : (
                paginatedTransactions.map((tx, index) => (
                  <motion.tr initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} key={`${tx.stationId}-${tx.id}`} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                    <td className="p-5"><p className="font-bold text-white">{tx.date}</p><p className="text-sm text-neutral-400">{tx.stationName}</p></td>
                    <td className="p-5 text-neutral-300">{tx.service}</td>
                    <td className="p-5 font-medium text-white">{tx.amount?.toLocaleString()} FCFA</td>
                    <td className="p-5"><Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Payé</Badge></td>
                    <td className="p-5 text-right">
                      <button onClick={() => downloadTransactionReceipt(tx)} title="Télécharger le reçu (PDF)"
                        className="text-xs font-medium text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" /> PDF
                      </button>
                    </td>
                    <td className="p-5 text-right">
                      {isReviewed(tx) ? (
                        <span className="text-xs text-neutral-500 flex items-center justify-end gap-1"><Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> Noté</span>
                      ) : (
                        <button onClick={() => openReview(tx)} className="text-xs font-medium text-blue-400 hover:text-white bg-blue-500/10 hover:bg-blue-500 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 ml-auto">
                          <Star className="w-3.5 h-3.5" /> Noter
                        </button>
                      )}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
          {myTransactions.length > 0 && (
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={myTransactions.length}
              onPageChange={setPage}
              onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
            />
          )}
        </div>
      </section>

      {/* Modal avis */}
      <AnimatePresence>
        {reviewingTx && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-neutral-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl relative">
              <button onClick={() => setReviewingTx(null)} className="absolute top-4 right-4 text-neutral-400 hover:text-white"><X className="w-6 h-6" /></button>
              <h2 className="text-xl font-bold text-white mb-1">Votre avis</h2>
              <p className="text-neutral-400 text-sm mb-6">{reviewingTx.stationName}</p>
              <div className="flex justify-center mb-6"><StarRatingInput value={reviewRating} onChange={setReviewRating} /></div>
              <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)} placeholder="Un commentaire (optionnel)..." rows={3}
                className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors mb-4 resize-none" />
              <button onClick={submitReview} disabled={reviewRating === 0}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl transition-colors">
                Envoyer mon avis
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
