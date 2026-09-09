// supabase/functions/create-platform-payment/index.ts
//
// Facture PayDunya pour un paiement qui revient à 100 % à la plateforme
// (aucune redistribution PER) :
//   kind = 'saas'      -> station_renewal_payments (renouvellement d'abonnement)
//   kind = 'superuser' -> super_user_subscriptions (offre automobiliste)
//   kind = 'ad'        -> station_ads (publicité station)
//
// La ligne PENDING est déjà créée par le front (lib/stationRenewal.js,
// lib/superUser.js, lib/ads.js). Ici on lit son montant côté serveur et on
// renvoie l'URL de paiement. paydunya-callback fera passer la ligne à
// ACTIVE / CONFIRMED — exactement ce que le Super Admin faisait à la main,
// qui reste possible en secours si le paiement en ligne échoue.
//
// verify_jwt reste à true : appel réservé à un utilisateur connecté. La
// lecture de la ligne se fait AVEC le JWT (client RLS) : si RLS la refuse,
// le caller n'a rien à payer ici.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, createInvoice } from "../_shared/paydunya.ts";

const TABLES: Record<string, string> = {
  saas: "station_renewal_payments",
  superuser: "super_user_subscriptions",
  ad: "station_ads",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { kind, rowId } = await req.json();
    const table = TABLES[kind];
    if (!table || !rowId) {
      return json({ error: "kind (saas|superuser|ad) et rowId requis." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Non authentifié." }, 401);

    // Lecture RLS-scopée : ne remonte que si le caller a le droit de voir
    // cette ligne (sa propre station / son propre compte / super admin).
    const { data: row, error: rowErr } = await asUser
      .from(table)
      .select("*")
      .eq("id", rowId)
      .single();
    if (rowErr || !row) return json({ error: "Paiement introuvable." }, 404);

    const alreadyDone =
      (kind === "superuser" && row.status === "ACTIVE") ||
      (kind === "ad" && row.status === "ACTIVE") ||
      (kind === "saas" && row.status === "CONFIRMED");
    if (alreadyDone) return json({ error: "Ce paiement est déjà validé." }, 409);

    const amount = Number(row.amount);
    if (!amount || amount <= 0) return json({ error: "Montant invalide." }, 400);

    const descriptions: Record<string, string> = {
      saas: `Abonnement Clean Car Galsen — ${row.plan ?? ""}`.trim(),
      superuser: `Abonnement automobiliste — ${row.plan ?? "Super User"}`,
      ad: "Publicité Clean Car Galsen",
    };

    const invoice = await createInvoice({
      totalAmount: amount,
      description: descriptions[kind],
      customData: { kind, rowId: String(rowId) },
    });

    if (!invoice.ok || !invoice.url) {
      console.error("PayDunya create-invoice KO:", invoice.raw);
      return json({ error: invoice.raw?.response_text || "Erreur PayDunya." }, 502);
    }

    return json({ token: invoice.token, urlPaiement: invoice.url });
  } catch (err) {
    console.error("create-platform-payment:", err);
    return json({ error: "Erreur serveur." }, 500);
  }
});
