// supabase/functions/create-lavage-payment/index.ts
//
// Appelée depuis le front React (client connecté) via :
//   supabase.functions.invoke('create-lavage-payment',
//     { body: { stationId, clientName, reservationGroupId, items } })
//
// items = [{ vehicleLabel, category, service, amount }] — le PANIER, pas des
// réservations. AUCUNE réservation n'est créée ici : une réservation en
// ligne n'existe qu'une fois le paiement confirmé. C'est paydunya-callback
// qui crée les réservations (déjà payées), les transactions/reçus et
// déclenche la redistribution PER.
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

type Item = { vehicleLabel: string; category: string; service: string; amount: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const stationId: string = body.stationId;
    const clientName: string = (body.clientName ?? "").toString().slice(0, 120);
    const reservationGroupId: string = (body.reservationGroupId ?? "").toString().slice(0, 40);
    const items: Item[] = Array.isArray(body.items) ? body.items : [];

    if (!stationId || items.length === 0 || items.length > 10) {
      return json({ error: "stationId et items (1 à 10) requis." }, 400);
    }
    // Validation stricte du panier : montants entiers positifs.
    for (const it of items) {
      if (
        !it || typeof it.vehicleLabel !== "string" || typeof it.service !== "string" ||
        typeof it.category !== "string" || !Number.isFinite(it.amount) || it.amount <= 0
      ) {
        return json({ error: "Panier invalide." }, 400);
      }
    }
    const montantTotal = items.reduce((s, it) => s + Math.round(it.amount), 0);
    if (montantTotal <= 0) return json({ error: "Montant total invalide." }, 400);

    // Utilisateur à partir du JWT transmis par le front.
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Non authentifié." }, 401);

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
        clientId: user.id,
        clientName,
        reservationGroupId,
        montantTotal: String(montantTotal),
        partStation: String(partStation),
        partPlateforme: String(partPlateforme),
        tauxCommission: String(taux),
        paydunyaAccountAlias: alias,
        items: JSON.stringify(
          items.map((it) => ({
            vehicleLabel: it.vehicleLabel.slice(0, 120),
            category: it.category.slice(0, 60),
            service: it.service.slice(0, 60),
            amount: Math.round(it.amount),
          })),
        ),
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
