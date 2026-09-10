// supabase/functions/_shared/finalizePayment.ts
//
// Logique de finalisation d'un paiement PayDunya déjà CONFIRMÉ
// (invoice.status === "completed"), partagée entre deux points d'entrée qui
// doivent produire EXACTEMENT le même résultat :
//   - paydunya-callback : IPN serveur à serveur envoyée par PayDunya.
//   - finalize-paydunya-payment : appelée par le navigateur du client à son
//     retour sur paiement-succes.html (PayDunya ajoute ?token=... à
//     PAYDUNYA_RETURN_URL), en SECOURS si l'IPN n'est jamais arrivée (URL de
//     callback mal configurée, vérification JWT qui bloque l'appel côté
//     Supabase, coupure réseau...). Voir "Points ouverts" dans
//     docs/PayDunya-PER.md — ce double-chemin existe précisément parce que
//     l'IPN seule n'a jamais été validée de bout en bout en conditions
//     réelles.
//
// Idempotent dans les deux cas : verrou unique sur
// paiements_lavage.paydunya_token pour un lavage (si l'IPN et le retour
// client arrivent tous les deux, le second se contente de relire ce que le
// premier a créé) ; vérification de statut déjà ACTIVE/CONFIRMED pour les
// paiements plateforme.

import { disburse } from "./paydunya.ts";

export async function log(admin: any, action: string) {
  try {
    await admin.from("audit_log").insert({ actor: "PayDunya", action });
  } catch (_) { /* le journal ne doit jamais faire échouer l'appelant */ }
}

export type LavageReceipt = {
  kind: "lavage";
  alreadyProcessed: boolean;
  station: { name: string; address: string; phone: string; logo: string | null; cachet: string | null };
  client: string;
  items: Array<{ label: string; service: string; amount: number }>;
  total: number;
  receiptId: string;
};

async function stationBrandingFor(admin: any, stationId: string) {
  const { data: station } = await admin.from("stations")
    .select("name, address, quartier, region, owner_phone, logo_url, cachet_url")
    .eq("id", stationId).maybeSingle();
  return {
    name: station?.name || "Station",
    address: station?.quartier
      ? `${station.quartier}${station.region ? `, ${station.region}` : ""}`
      : (station?.address || ""),
    phone: station?.owner_phone || "",
    logo: station?.logo_url || null,
    cachet: station?.cachet_url || null,
  };
}

async function readLavageReceipt(
  admin: any,
  token: string,
  station: LavageReceipt["station"],
  clientName: string,
  fallbackTotal: number,
): Promise<LavageReceipt> {
  const { data: row } = await admin.from("paiements_lavage")
    .select("reservation_ids").eq("paydunya_token", token).maybeSingle();
  const ids: string[] = row?.reservation_ids || [];
  const { data: rows } = ids.length
    ? await admin.from("reservations").select("vehicle_label, service, amount").in("id", ids)
    : { data: [] as any[] };
  const items = (rows || []).map((r: any) => ({ label: r.vehicle_label, service: r.service, amount: r.amount }));
  return {
    kind: "lavage",
    alreadyProcessed: true,
    station,
    client: clientName,
    items,
    total: items.reduce((s, it) => s + Number(it.amount || 0), 0) || fallbackTotal,
    receiptId: token.slice(0, 10).toUpperCase(),
  };
}

// ─── Lavage : création des réservations (déjà payées) + reçus + PER ───
// Une réservation en ligne n'existe QU'ICI, une fois le paiement confirmé.
export async function finalizeLavage(admin: any, token: string, custom: any): Promise<LavageReceipt | null> {
  const montantTotal = Number(custom.montantTotal || 0);
  const partStation = Number(custom.partStation || 0);
  const partPlateforme = Number(custom.partPlateforme || 0);
  const taux = Number(custom.tauxCommission || 0);
  const alias: string = custom.paydunyaAccountAlias;
  const stationId: string = custom.stationId;
  const clientId: string | null = custom.clientId || null;
  const clientName: string = custom.clientName || "Client";
  const groupId: string = custom.reservationGroupId || "";

  const station = await stationBrandingFor(admin, stationId);

  let items: Array<{ vehicleLabel: string; category: string; service: string; amount: number }> = [];
  try { items = JSON.parse(custom.items || "[]"); } catch (_) { items = []; }
  if (items.length === 0) {
    console.error("finalizeLavage: items vide", custom);
    await log(admin, `PayDunya: panier vide pour le jeton ${token} (kind=lavage) — voir logs`);
    return null;
  }

  // Verrou d'idempotence : 1 seule ligne par jeton PayDunya. Si elle existe
  // déjà (IPN et retour client arrivés tous les deux, ou double appel), on
  // relit ce qui a déjà été créé au lieu de rien recréer.
  const { error: insErr } = await admin.from("paiements_lavage").insert({
    station_id: stationId,
    client_id: clientId,
    montant_total: montantTotal,
    part_station: partStation,
    part_plateforme: partPlateforme,
    taux_commission: taux,
    paydunya_token: token,
    reservation_ids: [],
    statut_redistribution: "en_attente",
  });
  if (insErr) {
    if (insErr.code === "23505") return await readLavageReceipt(admin, token, station, clientName, montantTotal);
    console.error("paiements_lavage insert:", insErr);
    await log(admin, `PayDunya: échec insertion paiements_lavage pour ${token} — ${insErr.message}`);
    return null;
  }

  // Crée chaque réservation DÉJÀ payée, puis sa transaction/reçu (montant =
  // prix du lavage, comme un encaissement sur place — la commission
  // plateforme est tracée à part dans paiements_lavage).
  const createdIds: string[] = [];
  for (const it of items) {
    const { data: r, error: rErr } = await admin.from("reservations").insert({
      station_id: stationId,
      client_id: clientId,
      client_name: clientName,
      vehicle_label: it.vehicleLabel,
      category: it.category,
      service: it.service,
      status: "attente",
      paid: true,
      payment_method: "PayDunya",
      amount: it.amount,
      reservation_group_id: groupId || null,
      group_size: items.length > 1 ? items.length : null,
    }).select("id").single();
    if (rErr || !r) { console.error("reservations insert:", rErr); continue; }
    createdIds.push(r.id);
    await admin.from("transactions").insert({
      station_id: stationId,
      reservation_id: r.id,
      client_id: clientId,
      client_name: clientName,
      vehicle_label: it.vehicleLabel,
      service: it.service,
      method: "PayDunya",
      amount: it.amount,
    });
  }

  await admin.from("paiements_lavage")
    .update({ reservation_ids: createdIds })
    .eq("paydunya_token", token);

  // Redistribution automatique et instantanée de la part station.
  const res = await disburse({ accountAlias: alias, amount: partStation });
  await admin.from("paiements_lavage")
    .update({
      statut_redistribution: res.ok ? "reussi" : "echec",
      redistribution_detail: res.detail,
    })
    .eq("paydunya_token", token);

  await log(
    admin,
    res.ok
      ? `Lavage payé en ligne (${montantTotal} F) — ${partStation} F reversés à la station`
      : `Lavage payé en ligne (${montantTotal} F) — ÉCHEC redistribution (${res.step}: ${res.detail})`,
  );

  return {
    kind: "lavage",
    alreadyProcessed: false,
    station,
    client: clientName,
    items: items.map((it) => ({ label: it.vehicleLabel, service: it.service, amount: it.amount })),
    total: montantTotal,
    receiptId: token.slice(0, 10).toUpperCase(),
  };
}

// ─── Paiements plateforme : mêmes effets que la confirmation manuelle du
// Super Admin (voir useSuperAdminState.jsx confirmSuperUserPayment /
// confirmAdPayment / confirmRenewalPayment). Idempotent : ne rejoue rien si
// déjà ACTIVE/CONFIRMED. ─────────────────────────────────────────────────
export async function finalizePlatform(admin: any, token: string, kind: string, custom: any) {
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
    await log(admin, `Abonnement Super User confirmé par PayDunya (${sub.plan ?? ""})`);
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
    await log(admin, "Publicité confirmée par PayDunya");
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
  await log(admin, "Renouvellement d'abonnement confirmé par PayDunya");
}

// Point d'entrée commun : une facture PayDunya déjà revérifiée
// ("completed") auprès de PayDunya. Route selon custom_data.kind et renvoie
// un reçu prêt à afficher pour un lavage, ou un simple accusé pour les
// paiements plateforme (aucun reçu client à générer pour ceux-là).
export async function routeConfirmedInvoice(admin: any, token: string, invoice: any) {
  const custom = invoice.custom_data ?? invoice.invoice?.custom_data ?? {};
  const kind = custom.kind;

  if (kind === "lavage") return await finalizeLavage(admin, token, custom);
  if (kind === "saas" || kind === "superuser" || kind === "ad") {
    await finalizePlatform(admin, token, kind, custom);
    return { kind, alreadyProcessed: false };
  }

  console.error("routeConfirmedInvoice: kind inconnu", custom);
  await log(admin, `PayDunya: kind de paiement inconnu pour le jeton ${token} — ${JSON.stringify(custom).slice(0, 300)}`);
  return null;
}
