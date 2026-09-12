// supabase/functions/create-shop-payment/index.ts
//
// Appelée depuis le front React (client connecté) via :
//   supabase.functions.invoke('create-shop-payment',
//     { body: { stationId, clientName, productId, quantity, fulfillmentType,
//               deliveryAddress, deliveryPhone } })
//
// Contrairement à create-lavage-payment/create-vidange-payment (montant
// calculé et envoyé par le front), le prix est ici RECALCULÉ ici à partir du
// produit en base : un seul article bien identifié (productId), donc aucune
// raison de faire confiance au front — évite qu'un prix trafiqué còté client
// ne débite le mauvais montant pour un vrai produit physique en stock.
//
// Promo BOGO ("X achetés = Y offerts") non gérée ici : son calcul exact pour
// une quantité arbitraire est laissé à « Contacter la station » (WhatsApp,
// v1 de la boutique) plutôt que d'introduire un calcul de prix supplémentaire
// à maintenir. Seule la remise en % est appliquée automatiquement.
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

function activePercentDiscount(p: any): number {
  if (p.promo_type !== "percent" || !(p.promo_percent > 0 && p.promo_percent < 100)) return 0;
  const now = Date.now();
  if (p.promo_starts_at && new Date(p.promo_starts_at).getTime() > now) return 0;
  if (p.promo_ends_at && new Date(p.promo_ends_at).getTime() <= now) return 0;
  return p.promo_percent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const stationId: string = body.stationId;
    const clientName: string = (body.clientName ?? "").toString().slice(0, 120);
    const productId: string = body.productId;
    const quantity = Math.round(Number(body.quantity));
    const fulfillmentType: string = body.fulfillmentType === "livraison" ? "livraison" : "retrait";
    const deliveryAddress: string = (body.deliveryAddress ?? "").toString().slice(0, 300);
    const deliveryPhone: string = (body.deliveryPhone ?? "").toString().slice(0, 30);

    if (!stationId || !productId || !Number.isFinite(quantity) || quantity < 1 || quantity > 50) {
      return json({ error: "Commande invalide." }, 400);
    }
    if (fulfillmentType === "livraison" && !deliveryAddress.trim()) {
      return json({ error: "Adresse de livraison requise." }, 400);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: "Non authentifié." }, 401);

    const { data: station, error: stErr } = await admin
      .from("stations")
      .select("id, name, station_billing(paydunya_account_alias, commission_rate, plan, active_modules)")
      .eq("id", stationId)
      .single();
    if (stErr || !station) return json({ error: "Station introuvable." }, 404);

    const billing = Array.isArray(station.station_billing) ? station.station_billing[0] : station.station_billing;
    const hasShop = billing?.plan === "Business" || (billing?.active_modules || []).includes("mod_boutique");
    if (!hasShop) return json({ error: "Cette station n'a pas de boutique." }, 403);

    const { data: subOk } = await admin.rpc("station_subscription_ok", { sid: stationId });
    if (subOk === false) return json({ error: "L'abonnement de cette station n'est pas actif." }, 403);

    const { data: product, error: pErr } = await admin
      .from("shop_products")
      .select("id, station_id, name, price, currency, stock, active, promo_type, promo_percent, promo_starts_at, promo_ends_at")
      .eq("id", productId)
      .eq("station_id", stationId)
      .maybeSingle();
    if (pErr || !product) return json({ error: "Produit introuvable." }, 404);
    if (!product.active) return json({ error: "Ce produit n'est plus disponible." }, 404);
    if (product.promo_type === "bogo") {
      return json({ error: "Achat en ligne indisponible pour cette offre — contactez la station." }, 400);
    }
    if (product.stock != null && product.stock < quantity) {
      return json({ error: `Stock insuffisant (${product.stock} disponible${product.stock > 1 ? "s" : ""}).` }, 409);
    }

    const discount = activePercentDiscount(product);
    const unitPrice = discount > 0 ? Math.round(product.price * (1 - discount / 100)) : product.price;
    const montantTotal = unitPrice * quantity;
    if (!Number.isFinite(montantTotal) || montantTotal <= 0) return json({ error: "Montant invalide." }, 400);

    const alias: string | null = billing?.paydunya_account_alias ?? null;
    const { partStation, partPlateforme, taux } = splitLavage(montantTotal, billing?.commission_rate ?? null);

    const invoice = await createInvoice({
      totalAmount: montantTotal,
      description: `${product.name} x${quantity} — ${station.name}`,
      customData: {
        kind: "boutique",
        stationId,
        clientId: user.id,
        clientName,
        productId,
        productName: product.name,
        unitPrice: String(unitPrice),
        quantity: String(quantity),
        fulfillmentType,
        deliveryAddress: fulfillmentType === "livraison" ? deliveryAddress.trim() : "",
        deliveryPhone: deliveryPhone.trim(),
        montantTotal: String(montantTotal),
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
    console.error("create-shop-payment:", err);
    return json({ error: "Erreur serveur." }, 500);
  }
});
