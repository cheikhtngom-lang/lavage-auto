import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Car } from 'lucide-react';
import { useClientAccount } from '../../hooks/useClientAccount';
import { getLoginCount } from '../../lib/accounts';
import * as wizard from '../../lib/onboardingWizard';
import WizardModal from './WizardModal';
import GuidedTour from './GuidedTour';
import { CategoryPicker, BrandDropdown } from '../client/VehicleFormFields';

const ROLE = 'automobiliste';

const TOUR_STEPS = [
  { selector: '[data-tour="client-nav-overview"]', title: "Vue d'ensemble", text: "Suivez ici le statut de vos lavages en temps réel : position en file, temps restant, et l'historique de vos passages." },
  { selector: '[data-tour="client-nav-stations"]', title: 'Trouver une station', text: 'Cherchez une station près de chez vous et réservez votre place en quelques clics.' },
  { selector: '[data-tour="client-nav-garage"]', title: 'Mon Parking', text: 'Retrouvez ici vos véhicules enregistrés pour réserver encore plus vite la prochaine fois.' },
  { selector: '[data-tour="client-nav-settings"]', title: 'Paramètres', text: 'Gérez vos informations personnelles et votre mot de passe à tout moment.' },
];

// Assistant de configuration automobiliste : une courte séquence de modales
// (bienvenue -> ajout du 1er véhicule si le garage est vide) pilotée par
// ?onboarding=<étape> dans l'URL, puis une visite guidée du tableau de bord.
// Monté dans ClientLayout pour rester actif quelle que soit la sous-page
// (/dashboard, /dashboard/garage...). Voir [[design_onboarding_backlog]].
export default function ClientOnboarding() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { account, addVehicle } = useClientAccount();
  const [showTour, setShowTour] = useState(false);
  const [form, setForm] = useState({ category: '', brand: '', plate: '' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const urlStep = searchParams.get('onboarding');

  const setStepParam = (step) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      if (step) p.set('onboarding', step); else p.delete('onboarding');
      return p;
    }, { replace: true });
  };

  const hasVehicle = (account?.vehicles?.length || 0) > 0;

  // Déclenchement automatique : un compte encore "not_started" qui se connecte
  // (plafonné à 3 connexions, même règle que les bannières d'activation —
  // voir [[design_onboarding_backlog]]) démarre l'assistant, ou le reprend là
  // où il en était resté si une session précédente a été interrompue. Un
  // compte qui a déjà un véhicule (ex: existait avant ce système) n'a rien à
  // configurer : on clôt silencieusement sans jamais rien afficher.
  useEffect(() => {
    if (!account?.id || urlStep) return;
    const state = wizard.getOnboardingState(ROLE, account.id);
    if (state.status === 'completed') return;
    if (getLoginCount(ROLE, account.id) > 3) return;
    if (state.status === 'not_started' && hasVehicle) {
      wizard.finishWizard(ROLE, account.id);
      wizard.markTourDone(ROLE, account.id);
      return;
    }
    setStepParam(state.currentStep || 'welcome');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id, hasVehicle]);

  if (!account?.id) return null;

  const closeStep = (nextStep) => {
    if (nextStep) {
      wizard.goToStep(ROLE, account.id, nextStep);
      setStepParam(nextStep);
      return;
    }
    wizard.finishWizard(ROLE, account.id);
    setStepParam(null);
    const state = wizard.getOnboardingState(ROLE, account.id);
    if (!state.tourDone) setShowTour(true);
  };

  const finishTour = () => { wizard.markTourDone(ROLE, account.id); setShowTour(false); };

  if (showTour) return <GuidedTour steps={TOUR_STEPS} onFinish={finishTour} />;

  if (urlStep === 'welcome') {
    return (
      <WizardModal
        title={`Bienvenue, ${account.name?.split(' ')[0] || ''} !`}
        subtitle="Configurons votre compte en quelques secondes."
        stepIndex={0} totalSteps={2}
        onClose={() => closeStep(null)}
        footer={
          <button
            onClick={() => closeStep(hasVehicle ? null : 'add_vehicule')}
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
          On enregistre votre véhicule, et vous serez prêt à réserver votre premier lavage.
        </p>
      </WizardModal>
    );
  }

  if (urlStep === 'add_vehicule') {
    const canSubmit = !!form.category && !!form.brand && !!form.plate.trim();
    const submit = async () => {
      if (!canSubmit || saving) return;
      setSaving(true);
      setSaveError('');
      const created = await addVehicle({ category: form.category, brand: form.brand, plate: form.plate.trim() });
      setSaving(false);
      if (!created) { setSaveError('Impossible d\'enregistrer ce véhicule, réessayez.'); return; }
      closeStep(null);
    };
    return (
      <WizardModal
        title="Votre véhicule"
        subtitle="Le type et la marque déterminent le tarif appliqué lors de votre réservation."
        stepIndex={1} totalSteps={2}
        onClose={() => closeStep(null)}
        onSkip={() => closeStep(null)}
        footer={
          <button
            onClick={submit}
            disabled={!canSubmit || saving}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
          >
            {saving ? 'Enregistrement...' : 'Terminer'}
          </button>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-center mb-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 flex items-center justify-center">
              <Car className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-2 block">Type de véhicule</label>
            <CategoryPicker value={form.category} onChange={(category) => setForm({ category, brand: '', plate: form.plate })} />
          </div>
          {form.category && (
            <div>
              <label className="text-xs font-medium text-neutral-400 mb-2 block">Marque</label>
              <BrandDropdown category={form.category} value={form.brand} onChange={(brand) => setForm((f) => ({ ...f, brand }))} />
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-neutral-400 mb-2 block">Immatriculation</label>
            <input
              type="text" value={form.plate} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}
              placeholder="Ex: DK-1234-AB"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
            {saveError && <p className="text-sm text-red-400 mt-1">{saveError}</p>}
          </div>
        </div>
      </WizardModal>
    );
  }

  return null;
}
