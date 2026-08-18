// État centralisé de l'assistant de configuration (voir [[design_onboarding_backlog]]) —
// stocké en localStorage, par compte, pour permettre la reprise après une
// interruption (fermeture du navigateur, navigation ailleurs) sans reproposer
// les étapes déjà faites ou sautées.
const KEY_PREFIX = 'ccg_onboarding';
const DEFAULT_STATE = { status: 'not_started', currentStep: null, tourDone: false };

function storageKey(role, id) { return `${KEY_PREFIX}_${role}_${id}`; }

export function getOnboardingState(role, id) {
  if (!role || !id) return { ...DEFAULT_STATE };
  try {
    const raw = localStorage.getItem(storageKey(role, id));
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveOnboardingState(role, id, patch) {
  if (!role || !id) return getOnboardingState(role, id);
  const next = { ...getOnboardingState(role, id), ...patch };
  localStorage.setItem(storageKey(role, id), JSON.stringify(next));
  return next;
}

export function startWizard(role, id, firstStep) {
  return saveOnboardingState(role, id, { status: 'in_progress', currentStep: firstStep });
}

export function goToStep(role, id, step) {
  return saveOnboardingState(role, id, { status: 'in_progress', currentStep: step });
}

export function finishWizard(role, id) {
  return saveOnboardingState(role, id, { status: 'completed', currentStep: null });
}

export function markTourDone(role, id) {
  return saveOnboardingState(role, id, { tourDone: true });
}
