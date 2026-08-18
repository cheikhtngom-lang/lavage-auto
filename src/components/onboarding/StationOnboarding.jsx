import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Sparkles, UserPlus, Tag, ArrowRight } from 'lucide-react';
import { useAppState } from '../../hooks/useAppState';
import { getCurrentStationId, getLoginCount } from '../../lib/accounts';
import { supabase } from '../../lib/supabaseClient';
import * as wizard from '../../lib/onboardingWizard';
import WizardModal from './WizardModal';
import GuidedTour from './GuidedTour';

const ROLE = 'admin';

const TOUR_STEPS = [
  { selector: '[data-tour="admin-nav-overview"]', title: "File d'attente Live", text: 'Votre écran principal : les véhicules en cours de lavage et la file en attente, mis à jour en temps réel.' },
  { selector: '[data-tour="admin-nav-washers"]', title: 'Laveurs', text: 'Gérez la présence de vos laveurs au jour le jour et suivez leur pointage.' },
  { selector: '[data-tour="admin-nav-transactions"]', title: 'Transactions', text: 'Retrouvez tous les paiements encaissés, avec leurs reçus.' },
  { selector: '[data-tour="admin-nav-analytics"]', title: 'Analytique', text: 'Suivez votre chiffre d\'affaires et l\'activité de votre équipe.' },
  { selector: '[data-tour="admin-nav-team"]', title: 'Équipe', text: 'Ajoutez et gérez tous les membres de votre équipe (laveurs, caisse, superviseurs).' },
  { selector: '[data-tour="admin-nav-settings"]', title: 'Paramètres', text: "Personnalisez vos tarifs, vos horaires, et les informations de votre station à tout moment." },
];

// Assistant de configuration station : bienvenue -> 1er employé (si l'équipe
// est vide, seul vrai blocage avant de pouvoir démarrer un lavage) -> tarifs
// (informatif : les tarifs par défaut sont déjà actifs) -> visite guidée.
// Piloté par ?onboarding=<étape> dans l'URL, monté dans AdminLayout pour
// rester actif quelle que soit la sous-page. Voir [[design_onboarding_backlog]].
export default function StationOnboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { employees, addEmployee, stationProfile } = useAppState();
  const stationId = getCurrentStationId();
  const [showTour, setShowTour] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [hasCustomPricing, setHasCustomPricing] = useState(null); // null = pas encore vérifié
  const urlStep = searchParams.get('onboarding');

  useEffect(() => {
    if (!stationId || stationId === 'default') return;
    supabase.from('wash_pricing').select('id', { count: 'exact', head: true }).eq('station_id', stationId)
      .then(({ count }) => setHasCustomPricing((count || 0) > 0));
  }, [stationId]);

  const setStepParam = (step) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (step) p.set('onboarding', step); else p.delete('onboarding');
      return p;
    }, { replace: true });
  };

  const hasEmployee = (employees?.length || 0) > 0;

  // Déclenchement automatique, même règle que ClientOnboarding : plafonné à
  // 3 connexions, reprend une session interrompue là où elle s'était arrêtée.
  // Une station qui a déjà un employé ET des tarifs personnalisés (ex:
  // existait avant ce système) n'a rien à configurer : clôture silencieuse.
  useEffect(() => {
    if (!stationId || stationId === 'default' || urlStep || hasCustomPricing === null) return;
    const state = wizard.getOnboardingState(ROLE, stationId);
    if (state.status === 'completed') return;
    if (getLoginCount(ROLE, stationId) > 3) return;
    if (state.status === 'not_started' && hasEmployee && hasCustomPricing) {
      wizard.finishWizard(ROLE, stationId);
      wizard.markTourDone(ROLE, stationId);
      return;
    }
    setStepParam(state.currentStep || 'welcome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationId, hasCustomPricing, hasEmployee]);

  if (!stationId || stationId === 'default') return null;

  const closeStep = (nextStep) => {
    if (nextStep) {
      wizard.goToStep(ROLE, stationId, nextStep);
      setStepParam(nextStep);
      return;
    }
    wizard.finishWizard(ROLE, stationId);
    setStepParam(null);
    const state = wizard.getOnboardingState(ROLE, stationId);
    if (!state.tourDone) setShowTour(true);
  };

  const finishTour = () => { wizard.markTourDone(ROLE, stationId); setShowTour(false); };

  const afterEmployee = () => closeStep(hasCustomPricing ? null : 'pricing');

  if (showTour) return <GuidedTour steps={TOUR_STEPS} onFinish={finishTour} />;

  if (urlStep === 'welcome') {
    return (
      <WizardModal
        title={`Bienvenue${stationProfile?.name ? ', ' + stationProfile.name : ''} !`}
        subtitle="Votre station est déjà active et peut recevoir des réservations. Configurons le reste en quelques secondes."
        stepIndex={0} totalSteps={3}
        onClose={() => closeStep(null)}
        footer={
          <button
            onClick={() => closeStep(hasEmployee ? (hasCustomPricing ? null : 'pricing') : 'add_employee')}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
          >
            Commencer
          </button>
        }
      >
        <div className="flex items-center justify-center py-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-500/15 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>
        </div>
        <p className="text-neutral-300 text-sm text-center">
          Ajoutez votre premier laveur pour pouvoir démarrer un lavage dès qu'un client réserve.
        </p>
      </WizardModal>
    );
  }

  if (urlStep === 'add_employee') {
    const canSubmit = name.trim().length > 0;
    const submit = async () => {
      if (!canSubmit || saving) return;
      setSaving(true);
      setSaveError('');
      const { success } = await addEmployee({ name: name.trim(), role: 'Laveur', access: 'Standard (Gestion Quotidienne)' });
      setSaving(false);
      if (!success) { setSaveError("Impossible d'ajouter ce laveur, réessayez."); return; }
      afterEmployee();
    };
    return (
      <WizardModal
        title="Votre premier laveur"
        subtitle="Vous pourrez ajouter le reste de votre équipe à tout moment depuis Équipe."
        stepIndex={1} totalSteps={3}
        onClose={() => closeStep(null)}
        onSkip={afterEmployee}
        footer={
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Continuer'}
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center mb-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <UserPlus className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-2 block">Nom du laveur</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)} autoFocus
              placeholder="Ex: Moussa Diop"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            {saveError && <p className="text-sm text-red-400 mt-2">{saveError}</p>}
          </div>
        </div>
      </WizardModal>
    );
  }

  if (urlStep === 'pricing') {
    return (
      <WizardModal
        title="Vos tarifs"
        subtitle="Une grille par défaut est déjà active — vos clients peuvent réserver dès maintenant."
        stepIndex={2} totalSteps={3}
        onClose={() => closeStep(null)}
        footer={
          <button onClick={() => closeStep(null)} className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-6 py-2.5 rounded-xl transition-colors">
            Terminer
          </button>
        }
      >
        <div className="flex items-center justify-center mb-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center">
            <Tag className="w-6 h-6 text-blue-400" />
          </div>
        </div>
        <p className="text-neutral-300 text-sm text-center mb-4">
          Vous pouvez personnaliser vos prix et durées de lavage par catégorie de véhicule à tout moment.
        </p>
        <button
          onClick={() => { closeStep(null); navigate('/admin/settings'); }}
          className="w-full flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
        >
          Personnaliser mes tarifs maintenant <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </WizardModal>
    );
  }

  return null;
}
