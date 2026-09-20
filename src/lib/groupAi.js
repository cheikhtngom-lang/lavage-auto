// Analyste IA du groupe (offre Sur mesure, phase 3) : appels aux Edge Functions
// group-ai (rapport / question) et lecture de l'historique. Voir
// add_group_ai.sql et supabase/functions/_shared/groupAiHandlers.ts.
// L'IA ne reçoit que les chiffres agrégés du tableau de bord : jamais de nom de
// client, de plaque ni de laveur.
import { supabase } from './supabaseClient';

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const FRIENDLY = {
  ia_non_configuree: "L'analyse IA n'est pas encore activée sur la plateforme. Elle le sera très bientôt.",
  limite_atteinte: 'Vous avez atteint votre limite mensuelle de demandes IA.',
  aucune_donnee: 'Aucune activité à analyser sur cette période (ou aucune station sélectionnée).',
};

// Appelle group-ai et remonte le message JSON d'une réponse non-2xx.
async function callAi(body) {
  const { data, error } = await supabase.functions.invoke('group-ai', { body });
  if (error) {
    let d = null;
    try { d = await error.context?.json?.(); } catch { /* ignore */ }
    const code = d?.error || 'ia_erreur';
    throw new AiError(code, d?.message || FRIENDLY[code] || "L'analyse a échoué. Réessayez.");
  }
  if (data?.error) throw new AiError(data.error, data.message || FRIENDLY[data.error] || "L'analyse a échoué.");
  return data; // { ok, id, answer, model, usage: { used, limit } }
}

const periodBody = ({ from, to, stationIds, periodLabel }) => ({
  from: from.toISOString(),
  to: to.toISOString(),
  stationIds: stationIds && stationIds.length ? stationIds : undefined,
  periodLabel,
});

export const requestReport = (p) => callAi({ action: 'report', ...periodBody(p) });

// history : [{ role: 'user' | 'assistant', content }] des échanges précédents (6 derniers gardés côté serveur).
export const askQuestion = (p) => callAi({ action: 'ask', ...periodBody(p), question: p.question, history: p.history || [] });

export async function fetchAiUsage() {
  const { data, error } = await supabase.rpc('group_ai_usage');
  if (error) throw new Error(error.message);
  return data; // { org_id, org_name, used, limit, resets_on }
}

export async function fetchAiHistory(limit = 40) {
  const { data, error } = await supabase
    .from('group_ai_reports')
    .select('id, kind, period_label, question, answer, model, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function deleteAiEntry(id) {
  const { error } = await supabase.rpc('group_ai_delete', { p_id: id });
  if (error) throw new Error(error.message);
}
