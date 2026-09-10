// supabase/functions/finalize-paydunya-payment/index.ts
//
// Filet de secours appelé par le NAVIGATEUR du client (paiement-succes.html)
// à son retour de PayDunya, qui ajoute automatiquement ?token=<jeton> à
// PAYDUNYA_RETURN_URL. Fait exactement ce que paydunya-callback (l'IPN
// serveur à serveur) fait déjà — même revérification, même logique de
// finalisation, même idempotence (_shared/finalizePayment.ts) — pour que le
// paiement soit finalisé même si l'IPN n'est jamais arrivée jusqu'à nous
// (mauvaise configuration de PAYDUNYA_CALLBACK_URL, vérification JWT qui la
// bloque, coupure réseau...). Voir docs/PayDunya-PER.md.
//
// Public (verify_jwt = false, comme paydunya-callback) : l'autorisation
// réelle est la revérification du jeton auprès de PayDunya lui-même — un
// jeton que PayDunya confirme "completed" correspond à un paiement
// réellement effectué, quel que soit qui appelle cette fonction.
//
// Renvoie un reçu prêt à afficher (station + articles + montant) pour un
// paiement de lavage, afin que le client obtienne AUSSI un reçu de la
// station (logo, coordonnées) en plus de celui de PayDunya — voir
// paiement-succes.html.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, confirmInvoice } from "../_shared/paydunya.ts";
import { log, routeConfirmedInvoice } from "../_shared/finalizePayment.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const token: string = (body?.token ?? "").toString().trim();
    if (!token) return json({ error: "Jeton manquant." }, 400);

    const invoice = await confirmInvoice(token);
    if (invoice?.response_code && invoice.response_code !== "00") {
      return json({ error: invoice?.response_text || "Jeton PayDunya invalide." }, 400);
    }
    if (invoice?.status !== "completed") {
      // Pas encore payé (rare course avec le retour navigateur) ou annulé —
      // pas une erreur serveur, juste rien à finaliser pour l'instant.
      return json({ ok: false, status: invoice?.status ?? "inconnu" });
    }

    const result = await routeConfirmedInvoice(admin, token, invoice);
    if (!result) return json({ error: "Paiement confirmé mais impossible à finaliser — contactez le support." }, 500);

    return json({ ok: true, ...result });
  } catch (err) {
    console.error("finalize-paydunya-payment:", err);
    await log(admin, `finalize-paydunya-payment: exception — ${String(err)}`);
    return json({ error: "Erreur serveur." }, 500);
  }
});
