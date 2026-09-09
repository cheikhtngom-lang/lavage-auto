// Passerelle de paiement en ligne PayDunya — remplace la simulation
// (setTimeout) qui marquait un paiement « effectué » sans rien encaisser.
//
// Chaque fonction crée une facture côté serveur (Edge Function) puis
// REDIRIGE le navigateur vers la page de paiement PayDunya. Le retour de
// l'argent et la validation en base sont gérés par l'Edge Function
// paydunya-callback (serveur à serveur), indépendamment de ce que fait le
// client après paiement — voir supabase/functions/.
import { supabase } from './supabaseClient';

async function invokeAndRedirect(fn, body) {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    // supabase-js enrobe les erreurs HTTP : on tente de récupérer le
    // message JSON renvoyé par la fonction ({ error: "..." }).
    let msg = error.message;
    try {
      const j = await error.context?.json?.();
      if (j?.error) msg = j.error;
    } catch (_) { /* garde error.message */ }
    throw new Error(msg || 'Le paiement en ligne est momentanément indisponible.');
  }
  if (!data?.urlPaiement) {
    throw new Error(data?.error || 'Réponse inattendue du serveur de paiement.');
  }
  window.location.href = data.urlPaiement;
}

// Lavage : `reservationIds` = les réservations déjà créées (non payées)
// pour ce panier. La commission plateforme et la redistribution vers la
// station sont calculées côté serveur.
export function payLavageOnline({ stationId, reservationIds }) {
  return invokeAndRedirect('create-lavage-payment', { stationId, reservationIds });
}

// Paiements 100 % plateforme (aucune redistribution). `rowId` = l'id de la
// ligne PENDING déjà créée (station_renewal_payments / super_user_
// subscriptions / station_ads).
export function payPlatformOnline({ kind, rowId }) {
  return invokeAndRedirect('create-platform-payment', { kind, rowId });
}
