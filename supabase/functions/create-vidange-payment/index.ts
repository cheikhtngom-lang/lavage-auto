// supabase/functions/create-vidange-payment/index.ts
//
// Appelée depuis le front React (client connecté) via :
//   supabase.functions.invoke('create-vidange-payment',
//     { body: { stationId, clientName, vehicleLabel, category, oilType,
//               filtreHuile, filtreAir, mileage, scheduledAt, amount } })
//
// UN rendez-vous (pas un panier, contrairement à create-lavage-payment).
// Aucune ligne n'est créée ici : le rendez-vous vidange n'existe qu'une fois
// le paiement confirmé (voir _shared/finalizePayment.ts:finalizeVidange,
// appelée par paydunya-callback / finalize-paydunya-payment).
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
    const clientName: string = (body.clientName ?? "").toString().slice(0, 120);
    const vehicleLabel: string = (body.vehicleLabel ?? "").toString().slice(0, 120);
    const category: string = (body.category ?? "").toString().slice(0, 60);
    const oilType: string = (body.oilType ?? "").toString().slice(0, 60);
    const filtreHuile = !!body.filtreHuile;
    const filtreAir = !!body.filtreAir;
    const mileage: number | null = Number.isFinite(body.mileage) ? Math.round(body.mileage) : null;
    const scheduledAt: string = (body.scheduledAt ?? "").toString();
    const amount = Math.round(Number(body.amount));

    if (!stationId || !vehicleLabel || !category || !oilType || !scheduledAt) {
      return json({ error: "Informations de rendez-vous incomplètes." }, 400);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return json({ error: "Montant invalide." }, 400);
    }
    const when = new Date(scheduledAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      return json({ error: "Créneau invalide — choisissez une date/heure future." }, 400);
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

    // Station + vidange activée + abonnement + compte PayDunya.
    const { data: station, error: stErr } = await admin
      .from("stations")
      .select("id, name, vidange_enabled, vidange_daily_capacity, station_billing(paydunya_account_alias, commission_rate, plan, active_modules)")
      .eq("id", stationId)
      .single();
    if (stErr || !station) return json({ error: "Station introuvable." }, 404);
    const vidangeBilling = Array.isArray(station.station_billing) ? station.station_billing[0] : station.station_billing;
    // Réservée au forfait Business (ou module mod_vidange) — même contrôle
    // que le trigger Postgres sur stations.vidange_enabled (add_plan_gating.sql),
    // vérifié ici aussi en cas de rétrogradation après activation.
    const vidangeEligible = vidangeBilling?.plan === "Business" || (vidangeBilling?.active_modules || []).includes("mod_vidange");
    if (!station.vidange_enabled || !vidangeEligible) return json({ error: "Cette station ne propose pas la vidange." }, 403);

    const { data: subOk } = await admin.rpc("station_subscription_ok", { sid: stationId });
    if (subOk === false) {
      return json({ error: "L'abonnement de cette station n'est pas actif." }, 403);
    }

    // Capacité du créneau — vérification best-effort (pas de verrou : une
    // course entre deux paiements simultanés sur le même créneau reste
    // possible, cas rare que la station gère alors manuellement). L'objectif
    // ici est surtout d'éviter qu'un créneau déjà plein depuis longtemps
    // n'accepte encore des paiements.
    const dayStart = new Date(when); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const { count } = await admin
      .from("vidange_bookings")
      .select("id", { count: "exact", head: true })
      .eq("station_id", stationId)
      .eq("status", "confirmee")
      .eq("scheduled_at", when.toISOString());
    if ((count || 0) >= Math.max(1, station.vidange_daily_capacity || 1)) {
      return json({ error: "Ce créneau vient d'être pris — choisissez un autre horaire." }, 409);
    }

    const alias: string | null = vidangeBilling?.paydunya_account_alias ?? null;

    const { partStation, partPlateforme, taux } = splitLavage(amount, vidangeBilling?.commission_rate ?? null);

    const invoice = await createInvoice({
      totalAmount: amount,
      description: `Vidange — ${station.name}`,
      customData: {
        kind: "vidange",
        stationId,
        clientId: user.id,
        clientName,
        vehicleLabel,
        category,
        oilType,
        filtreHuile: filtreHuile ? "1" : "",
        filtreAir: filtreAir ? "1" : "",
        mileage: mileage != null ? String(mileage) : "",
        scheduledAt: when.toISOString(),
        montantTotal: String(amount),
        partStation: String(partStation),
        partPlateforme: String(partPlateforme),
        tauxCommission: String(taux),
        paydunyaAccountAlias: alias || "",
      },
      storeName: station.name,
    });

    if (!invoice.ok || !invoice.url) {
      console.error("PayDunya create-invoice KO:", invoice.raw);
      return json({ error: invoice.raw?.response_text || "Erreur PayDunya." }, 502);
    }

    return json({ token: invoice.token, urlPaiement: invoice.url });
  } catch (err) {
    console.error("create-vidange-payment:", err);
    return json({ error: "Erreur serveur." }, 500);
  }
});
