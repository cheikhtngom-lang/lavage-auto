// supabase/functions/paydunya-callback/index.ts
//
// URL PUBLIQUE appelée directement par les serveurs PayDunya (IPN), jamais
// par l'app. PayDunya n'envoie aucun JWT Supabase => verify_jwt = false
// (voir supabase/config.toml).
//
// Route le paiement confirmé selon custom_data.kind :
//   'lavage'    -> marque les réservations payées, crée les transactions,
//                  redistribue la part station via PER (disburse).
//   'saas'      -> station_renewal_payments CONFIRMED + station_billing à jour.
//   'superuser' -> super_user_subscriptions ACTIVE (1 mois).
//   'ad'        -> station_ads ACTIVE (durée de l'offre).
//
// Toujours répondre 200 : sinon PayDunya réessaie en boucle. Les erreurs
// sont loguées pour investigation. Idempotent : un rappel du même paiement
// ne rejoue rien (jeton unique sur paiements_lavage, statut déjà avancé
// pour les paiements plateforme).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { confirmInvoice, disburse } from "../_shared/paydunya.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const OK = new Response("OK", { status: 200 });

async function log(action: string) {
  try {
    await admin.from("audit_log").insert({ actor: "PayDunya", action });
  } catch (_) { /* le journal ne doit jamais faire échouer le callback */ }
}

Deno.serve(async (req) => {
  try {
    // PayDunya poste en x-www-form-urlencoded (champ "data" = JSON) ; on
    // tolère aussi un POST JSON direct (tests / évolutions d'API).
    let token: string | undefined;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const b = await req.json();
      token = b?.data?.invoice?.token ?? b?.invoice?.token ?? b?.token;
    } else {
      const form = await req.formData();
      const raw = form.get("data");
      if (raw) {
        const parsed = JSON.parse(raw.toString());
        token = parsed?.invoice?.token;
      }
    }
    if (!token) return OK;

    // Revérification obligatoire du statut réel auprès de PayDunya.
    const invoice = await confirmInvoice(token);
    if (invoice?.status !== "completed") return OK;

    const custom = invoice.custom_data ?? invoice.invoice?.custom_data ?? {};
    const kind = custom.kind;

    if (kind === "lavage") {
      await handleLavage(token, invoice, custom);
    } else if (kind === "saas" || kind === "superuser" || kind === "ad") {
      await handlePlatform(token, kind, custom);
    } else {
      console.error("paydunya-callback: kind inconnu", custom);
    }

    return OK;
  } catch (err) {
    console.error("paydunya-callback:", err);
    return OK;
  }
});

// ─── Lavage : encaissement + redistribution PER ──────────────────────--
async function handleLavage(token: string, invoice: any, custom: any) {
  const montantTotal = Number(custom.montantTotal || invoice.total_amount || 0);
  const partStation = Number(custom.partStation || 0);
  const partPlateforme = Number(custom.partPlateforme || 0);
  const taux = Number(custom.tauxCommission || 0);
  const alias: string = custom.paydunyaAccountAlias;
  const stationId: string = custom.stationId;
  const clientId: string | null = custom.clientId || null;
  const reservationIds: string[] = String(custom.reservationIds || "")
    .split(",").map((s) => s.trim()).filter(Boolean);

  // Verrou d'idempotence : 1 seule ligne par jeton PayDunya. Si elle existe
  // déjà, le callback a déjà été traité -> on sort.
  const { error: insErr } = await admin.from("paiements_lavage").insert({
    station_id: stationId,
    client_id: clientId,
    montant_total: montantTotal,
    part_station: partStation,
    part_plateforme: partPlateforme,
    taux_commission: taux,
    paydunya_token: token,
    reservation_ids: reservationIds,
    statut_redistribution: "en_attente",
  });
  if (insErr) {
    if (insErr.code === "23505") return; // déjà traité
    console.error("paiements_lavage insert:", insErr);
    return;
  }

  // Marque chaque réservation payée + crée sa transaction (montant = prix
  // du lavage, comme un encaissement sur place — la commission plateforme
  // est tracée à part dans paiements_lavage).
  const { data: reservations } = await admin
    .from("reservations")
    .select("id, amount, client_id, client_name, vehicle_label, service, paid")
    .in("id", reservationIds);

  for (const r of reservations ?? []) {
    if (r.paid) continue;
    await admin.from("reservations")
      .update({ paid: true, payment_method: "PayDunya" })
      .eq("id", r.id);
    await admin.from("transactions").insert({
      station_id: stationId,
      reservation_id: r.id,
      client_id: r.client_id,
      client_name: r.client_name,
      vehicle_label: r.vehicle_label,
      service: r.service,
      method: "PayDunya",
      amount: r.amount ?? 0,
    });
  }

  // Redistribution automatique et instantanée de la part station.
  const res = await disburse({ accountAlias: alias, amount: partStation });
  await admin.from("paiements_lavage")
    .update({
      statut_redistribution: res.ok ? "reussi" : "echec",
      redistribution_detail: res.detail,
    })
    .eq("paydunya_token", token);

  await log(
    res.ok
      ? `Lavage payé en ligne (${montantTotal} F) — ${partStation} F reversés à la station`
      : `Lavage payé en ligne (${montantTotal} F) — ÉCHEC redistribution (${res.step}: ${res.detail})`,
  );
}

// ─── Paiements plateforme : mêmes effets que la confirmation manuelle du
// Super Admin (voir useSuperAdminState.jsx confirmSuperUserPayment /
// confirmAdPayment / confirmRenewalPayment). ─────────────────────────--
async function handlePlatform(token: string, kind: string, custom: any) {
  const rowId: string = custom.rowId;
  if (!rowId) return;
  const now = new Date();

  if (kind === "superuser") {
    const { data: sub } = await admin.from("super_user_subscriptions")
      .select("id, status, plan").eq("id", rowId).single();
    if (!sub || sub.status === "ACTIVE") return;
    const expires = new Date(now); expires.setMonth(expires.getMonth() + 1);
    await admin.from("super_user_subscriptions").update({
      status: "ACTIVE",
      started_at: now.toISOString(),
      expires_at: expires.toISOString(),
      confirmed_at: now.toISOString(),
      paydunya_token: token,
    }).eq("id", rowId);
    await log(`Abonnement Super User confirmé par PayDunya (${sub.plan ?? ""})`);
    return;
  }

  if (kind === "ad") {
    const { data: ad } = await admin.from("station_ads")
      .select("id, status, duration_days").eq("id", rowId).single();
    if (!ad || ad.status === "ACTIVE") return;
    const expires = new Date(now);
    expires.setDate(expires.getDate() + (ad.duration_days || 7));
    await admin.from("station_ads").update({
      status: "ACTIVE",
      starts_at: now.toISOString(),
      expires_at: expires.toISOString(),
      confirmed_at: now.toISOString(),
      paydunya_token: token,
    }).eq("id", rowId);
    await log("Publicité confirmée par PayDunya");
    return;
  }

  // kind === "saas"
  const { data: pay } = await admin.from("station_renewal_payments")
    .select("id, status, station_id").eq("id", rowId).single();
  if (!pay || pay.status === "CONFIRMED") return;
  const nextDate = new Date(now); nextDate.setDate(nextDate.getDate() + 30);
  await admin.from("station_renewal_payments").update({
    status: "CONFIRMED",
    confirmed_at: now.toISOString(),
    paydunya_token: token,
  }).eq("id", rowId);
  await admin.from("station_billing").update({
    subscription_status: "a_jour",
    next_billing_date: nextDate.toISOString(),
  }).eq("station_id", pay.station_id);
  await log("Renouvellement d'abonnement confirmé par PayDunya");
}
