// supabase/functions/create-lavage-payment/index.ts
//
// Appelée depuis le front React (client connecté) via :
//   supabase.functions.invoke('create-lavage-payment',
//     { body: { stationId, reservationIds } })
//
// Crée UNE facture PayDunya pour un panier de réservations déjà créées
// (statut 'attente', paid = false), calcule la répartition commission /
// station, et renvoie l'URL de paiement. C'est paydunya-callback qui, à la
// confirmation, marque les réservations payées, crée les transactions et
// déclenche la redistribution PER vers la station.
//
// verify_jwt reste à true (défaut) : appel réservé à un utilisateur connecté.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  json,
  createInvoice,
  splitLavage,
} from "../_shared/paydunya.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const stationId: string = body.stationId;
    const reservationIds: string[] = Array.isArray(body.reservationIds)
      ? body.reservationIds
      : body.reservationId
        ? [body.reservationId]
        : [];

    if (!stationId || reservationIds.length === 0) {
      return json({ error: "stationId et reservationIds requis." }, 400);
    }

    // Utilisateur à partir du JWT transmis par le front.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Non authentifié." }, 401);

    // Réservations : doivent appartenir à cette station, être en attente et
    // non déjà payées. On resomme les montants côté serveur (jamais confiance
    // au total envoyé par le navigateur).
    const { data: reservations, error: resErr } = await admin
      .from("reservations")
      .select("id, amount, paid, status, station_id, client_id")
      .in("id", reservationIds);

    if (resErr || !reservations || reservations.length === 0) {
      return json({ error: "Réservations introuvables." }, 404);
    }
    const invalid = reservations.find(
      (r) => r.station_id !== stationId || r.paid || !["attente", "en_cours"].includes(r.status),
    );
    if (invalid) {
      return json({ error: "Une réservation est déjà payée ou invalide." }, 409);
    }
    const montantTotal = reservations.reduce((s, r) => s + (r.amount || 0), 0);
    if (montantTotal <= 0) {
      return json({ error: "Montant total invalide." }, 400);
    }

    // Station + abonnement + compte PayDunya de la station.
    const { data: station, error: stErr } = await admin
      .from("stations")
      .select("id, name, station_billing(paydunya_account_alias, commission_rate)")
      .eq("id", stationId)
      .single();
    if (stErr || !station) return json({ error: "Station introuvable." }, 404);

    const { data: subOk } = await admin.rpc("station_subscription_ok", { sid: stationId });
    if (subOk === false) {
      return json({ error: "L'abonnement de cette station n'est pas actif." }, 403);
    }

    const billing = Array.isArray(station.station_billing)
      ? station.station_billing[0]
      : station.station_billing;
    const alias: string | null = billing?.paydunya_account_alias ?? null;
    if (!alias) {
      return json({
        error: "Cette station n'a pas encore renseigné son compte PayDunya. Paiement en ligne indisponible — réglez sur place.",
      }, 400);
    }

    const { partStation, partPlateforme, taux } = splitLavage(
      montantTotal,
      billing?.commission_rate ?? null,
    );

    const invoice = await createInvoice({
      totalAmount: montantTotal,
      description: `Lavage auto — ${station.name}`,
      customData: {
        kind: "lavage",
        stationId,
        reservationIds: reservationIds.join(","),
        clientId: user.id,
        montantTotal: String(montantTotal),
        partStation: String(partStation),
        partPlateforme: String(partPlateforme),
        tauxCommission: String(taux),
        paydunyaAccountAlias: alias,
      },
      storeName: station.name,
    });

    if (!invoice.ok || !invoice.url) {
      console.error("PayDunya create-invoice KO:", invoice.raw);
      return json({ error: invoice.raw?.response_text || "Erreur PayDunya." }, 502);
    }

    return json({ token: invoice.token, urlPaiement: invoice.url });
  } catch (err) {
    console.error("create-lavage-payment:", err);
    return json({ error: "Erreur serveur." }, 500);
  }
});
