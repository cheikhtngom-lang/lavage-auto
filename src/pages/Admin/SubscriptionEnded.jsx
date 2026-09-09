import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Smartphone, Clock3, LogOut, Loader2, RefreshCw } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { useSuperAdminState } from '../../hooks/useSuperAdminState';
import { clearSession, getCurrentRole, getCurrentStationId } from '../../lib/accounts';
import { createRenewalPayment, isSubscriptionEnded } from '../../lib/stationRenewal';
import { payPlatformOnline } from '../../lib/paydunya';
import { useDocumentTitle } from '../../lib/useDocumentTitle';

// Écran de blocage plein écran (pas de AdminLayout, pas de menu) quand
// l'abonnement d'une station a pris fin (voir isSubscriptionEnded,
// lib/stationRenewal.js) — seule action possible : renouveler ou se
// déconnecter. AdminLayout.jsx redirige ici automatiquement ; cette page
// se protège aussi elle-même au cas où elle serait ouverte directement.
export default function SubscriptionEnded() {
  useDocumentTitle('Abonnement expiré');
  const navigate = useNavigate();
  const { stationBilling, stationProfile } = useAppState();
  const { PLANS, stationRenewalPayments } = useSuperAdminState();
  const stationId = getCurrentStationId();

  const [paymentMethod, setPaymentMethod] = useState(null);
  const [paymentPhone, setPaymentPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  useEffect(() => {
    const role = getCurrentRole();
    if (role !== 'admin' && role !== 'staff') window.location.href = '/login.html';
  }, []);

  // Si la station n'est en fait plus bloquée (déjà renouvelée, ou accédée
  // directement par erreur), pas de raison de rester coincé ici.
  useEffect(() => {
    if (stationBilling && !isSubscriptionEnded(stationBilling)) navigate('/admin/queue', { replace: true });
  }, [stationBilling, navigate]);

  if (!stationBilling) return null;

  const planDef = PLANS[stationBilling.plan] || { label: stationBilling.plan, price: 0 };
  const latestPayment = stationRenewalPayments
    .filter((p) => p.stationId === stationId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const isPending = justSubmitted || latestPayment?.status === 'PENDING';

  // Ne réactive JAMAIS la station toute seule : crée une ligne PENDING, que
  // seul le Super Admin confirme une fois l'argent réellement reçu (voir
  // confirmRenewalPayment, useSuperAdminState.jsx).
  const handleSubmit = async () => {
    if (!paymentMethod || paymentPhone.trim().length < 6) return;
    setSubmitting(true);
    setError('');
    try {
      const row = await createRenewalPayment(stationId, {
        plan: stationBilling.plan,
        amount: planDef.price,
        method: paymentMethod === 'wave' ? 'Wave' : 'Orange Money',
        reference: paymentPhone.trim(),
      });
      // Redirige vers PayDunya pour régler tout de suite ; le callback
      // remet la station "à jour" automatiquement. Si la redirection
      // échoue, la ligne PENDING reste confirmable à la main par le Super Admin.
      await payPlatformOnline({ kind: 'saas', rowId: row.id });
      setJustSubmitted(true);
    } catch (err) {
      setError(err.message || "Impossible de démarrer le paiement, réessayez.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    window.location.replace(window.location.origin + '/index.html');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="glass-card rounded-2xl p-6 md:p-8 border border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2.5 bg-red-500/20 rounded-xl"><Lock className="w-5 h-5 text-red-400" /></div>
            <div>
              <h1 className="text-xl font-bold text-white">Abonnement terminé</h1>
              <p className="text-neutral-400 text-sm">{stationProfile?.name || 'Votre station'}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-400 mb-6">
            {stationBilling.subscriptionStatus === 'en_retard'
              ? "Votre abonnement est marqué impayé. L'accès à votre tableau de bord est suspendu jusqu'au renouvellement."
              : "Votre mois d'essai gratuit est terminé. Renouvelez votre abonnement pour retrouver l'accès à votre tableau de bord."}
          </p>

          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-6 flex items-center justify-between">
            <div>
              <p className="text-neutral-500 text-xs mb-1">Plan actuel</p>
              <p className="text-white font-bold">{planDef.label}</p>
            </div>
            <p className="text-white font-bold text-lg">{planDef.price.toLocaleString('fr-FR')} <span className="text-neutral-500 text-xs font-normal">FCFA/mois</span></p>
          </div>

          {isPending ? (
            <div className="mb-6">
              <div className="flex items-start gap-3 bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3.5 mb-3">
                <Clock3 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-200/90">
                  Paiement enregistré, en attente de validation par notre équipe. Votre accès sera restauré dès confirmation.
                </p>
              </div>
              <button onClick={() => window.location.reload()} className="w-full flex items-center justify-center gap-2 text-neutral-400 hover:text-white text-sm font-medium py-2 transition-colors">
                <RefreshCw className="w-4 h-4" /> Actualiser
              </button>
            </div>
          ) : submitting ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
              <p className="text-neutral-300 text-sm">Enregistrement du paiement...</p>
            </div>
          ) : paymentMethod ? (
            <div className="space-y-4 mb-6">
              <button type="button" onClick={() => setPaymentMethod(null)} className="text-xs text-neutral-400 hover:text-white transition-colors">
                ← Changer de mode de paiement
              </button>
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1.5">Numéro {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'} <span className="text-red-400">*</span></label>
                <input type="tel" placeholder="+221 77 000 00 00" value={paymentPhone}
                  onChange={(e) => setPaymentPhone(e.target.value)}
                  className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button type="button" onClick={handleSubmit} disabled={paymentPhone.trim().length < 6}
                className={`w-full font-bold py-3.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 text-white disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed ${paymentMethod === 'wave' ? 'bg-[#1DC8E0] hover:bg-[#17aec3]' : 'bg-[#FF7900] hover:bg-[#e56b00]'}`}>
                <Smartphone className="w-5 h-5" /> Payer {planDef.price.toLocaleString('fr-FR')} FCFA via {paymentMethod === 'wave' ? 'Wave' : 'Orange Money'}
              </button>
            </div>
          ) : (
            <div className="space-y-3 mb-6">
              <button type="button" onClick={() => setPaymentMethod('wave')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#1DC8E0]/50 hover:bg-[#1DC8E0]/10 transition-colors text-left">
                <div className="w-11 h-11 rounded-xl bg-[#1DC8E0]/20 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-[#1DC8E0]" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">Wave</p>
                  <p className="text-neutral-500 text-xs">Payer en ligne</p>
                </div>
              </button>
              <button type="button" onClick={() => setPaymentMethod('orange_money')}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl border border-white/10 bg-white/5 hover:border-[#FF7900]/50 hover:bg-[#FF7900]/10 transition-colors text-left">
                <div className="w-11 h-11 rounded-xl bg-[#FF7900]/20 flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-[#FF7900]" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">Orange Money</p>
                  <p className="text-neutral-500 text-xs">Payer en ligne</p>
                </div>
              </button>
            </div>
          )}

          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-2 text-neutral-500 hover:text-white text-sm font-medium py-2 transition-colors border-t border-white/5 pt-4">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
