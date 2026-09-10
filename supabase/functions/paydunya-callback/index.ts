// supabase/functions/paydunya-callback/index.ts
//
// URL PUBLIQUE appelée directement par les serveurs PayDunya (IPN), jamais
// par l'app. PayDunya n'envoie aucun JWT Supabase => verify_jwt = false
// (voir supabase/config.toml — si ce callback ne se déclenche jamais côté
// station malgré un paiement PayDunya réussi côté client, la cause n°1 est
// que ce réglage n'a pas été appliqué au déploiement : Supabase répond alors
// 401 AVANT même d'exécuter ce code, donc rien n'apparaît nulle part. Voir
// "Vérifier verify_jwt" dans docs/PayDunya-PER.md).
//
// Route le paiement confirmé selon custom_data.kind (voir _shared/finalizePayment.ts) :
//   'lavage'    -> marque les réservations payées, crée les transactions,
//                  redistribue la part station via PER (disburse).
//   'saas'      -> station_renewal_payments CONFIRMED + station_billing à jour.
//   'superuser' -> super_user_subscriptions ACTIVE (1 mois).
//   'ad'        -> station_ads ACTIVE (durée de l'offre).
//
// Toujours répondre 200 : sinon PayDunya réessaie en boucle. Idempotent : un
// rappel du même paiement ne rejoue rien (jeton unique sur paiements_lavage,
// statut déjà avancé pour les paiements plateforme) — voir
// finalize-paydunya-payment, qui peut aussi traiter ce même paiement si
// l'IPN n'arrive jamais (retour du client sur paiement-succes.html).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmInvoice } from "../_shared/paydunya.ts";
import { log, routeConfirmedInvoice } from "../_shared/finalizePayment.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OK = new Response("OK", { status: 200 });

Deno.serve(async (req) => {
  // Toute invocation est journalisée AVANT même d'essayer de la comprendre —
  // sans ça, un échec de parsing (mauvais content-type, jeton absent, forme
  // inattendue) ne laisse strictement aucune trace, et un paiement encaissé
  // côté PayDunya mais invisible côté station devient indiagnosticable.
  await log(admin, `IPN reçue (${req.method}, content-type: ${req.headers.get("content-type") ?? "—"})`);

  try {
    let token: string | undefined;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const b = await req.json();
      token = b?.data?.invoice?.token ?? b?.invoice?.token ?? b?.token;
    } else {
      // Format documenté par PayDunya : x-www-form-urlencoded, champ "data"
      // contenant un JSON avec le jeton sous invoice.token.
      const form = await req.formData();
      const raw = form.get("data");
      if (raw) {
        const parsed = JSON.parse(raw.toString());
        token = parsed?.invoice?.token ?? parsed?.token;
      }
    }
    if (!token) {
      await log(admin, "IPN sans jeton exploitable — payload non reconnu");
      return OK;
    }

    // Revérification obligatoire du statut réel auprès de PayDunya (jamais
    // confiance dans le seul contenu du callback reçu).
    const invoice = await confirmInvoice(token);
    if (invoice?.response_code && invoice.response_code !== "00") {
      await log(admin, `IPN: confirmInvoice KO pour ${token} — ${invoice?.response_text ?? "réponse inattendue"}`);
      return OK;
    }
    if (invoice?.status !== "completed") {
      await log(admin, `IPN: statut "${invoice?.status ?? "inconnu"}" (pas "completed") pour ${token}`);
      return OK;
    }

    const result = await routeConfirmedInvoice(admin, token, invoice);
    if (!result) await log(admin, `IPN: routage échoué pour ${token} (voir logs de la fonction)`);

    return OK;
  } catch (err) {
    console.error("paydunya-callback:", err);
    await log(admin, `IPN: exception — ${String(err)}`);
    return OK;
  }
});
