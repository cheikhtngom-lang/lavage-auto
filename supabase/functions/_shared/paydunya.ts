// Helpers partagés par create-lavage-payment / create-platform-payment /
// paydunya-callback. Aucune clé en dur : tout vient des secrets Supabase
// (supabase secrets set ...). SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY /
// SUPABASE_ANON_KEY sont injectés automatiquement dans chaque Edge Function.

export const PAYDUNYA_MODE = Deno.env.get("PAYDUNYA_MODE") ?? "test";

export const PAYDUNYA_BASE_URL =
  PAYDUNYA_MODE === "live"
    ? "https://app.paydunya.com/api/v1"
    : "https://app.paydunya.com/sandbox-api/v1";

export const paydunyaHeaders = {
  "Content-Type": "application/json",
  "PAYDUNYA-MASTER-KEY": Deno.env.get("PAYDUNYA_MASTER_KEY") ?? "",
  "PAYDUNYA-PRIVATE-KEY": Deno.env.get("PAYDUNYA_PRIVATE_KEY") ?? "",
  "PAYDUNYA-TOKEN": Deno.env.get("PAYDUNYA_TOKEN") ?? "",
};

// Appelées depuis le navigateur via supabase.functions.invoke → il faut
// répondre au préflight OPTIONS et exposer les en-têtes CORS partout.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function defaultCommissionPercent(): number {
  return Number(Deno.env.get("PLATFORM_DEFAULT_COMMISSION_PERCENT") ?? "10");
}

// Répartition d'un paiement de lavage : commission plateforme (arrondie) +
// reste pour la station. `rate` en % ; null => valeur par défaut (secret).
export function splitLavage(montantTotal: number, rate: number | null) {
  const taux = rate ?? defaultCommissionPercent();
  const partPlateforme = Math.round((montantTotal * taux) / 100);
  const partStation = montantTotal - partPlateforme;
  return { partStation, partPlateforme, taux };
}

// ─── Facture de paiement (checkout) ──────────────────────────────────--
// PayDunya attend `store`, `invoice`, `actions` et `custom_data` au niveau
// racine du corps. `custom_data` nous revient tel quel dans le callback :
// on y met tout ce dont paydunya-callback a besoin pour router le paiement.
export async function createInvoice(opts: {
  totalAmount: number;
  description: string;
  customData: Record<string, unknown>;
  storeName?: string;
}): Promise<{ ok: boolean; token?: string; url?: string; raw: any }> {
  const payload = {
    invoice: {
      total_amount: opts.totalAmount,
      description: opts.description,
    },
    store: { name: opts.storeName ?? "Clean Car Galsen" },
    actions: {
      cancel_url: Deno.env.get("PAYDUNYA_CANCEL_URL"),
      return_url: Deno.env.get("PAYDUNYA_RETURN_URL"),
      callback_url: Deno.env.get("PAYDUNYA_CALLBACK_URL"),
    },
    custom_data: opts.customData,
  };

  const resp = await fetch(`${PAYDUNYA_BASE_URL}/checkout-invoice/create`, {
    method: "POST",
    headers: paydunyaHeaders,
    body: JSON.stringify(payload),
  });
  const raw = await resp.json();
  const ok = raw?.response_code === "00";
  return {
    ok,
    token: raw?.token,
    url: raw?.response_text || raw?.checkout_url,
    raw,
  };
}

// Revérification obligatoire du statut réel d'une facture : on ne fait
// jamais confiance au seul contenu du callback reçu.
//
// Lit la réponse en texte d'abord (pas resp.json() directement) : si
// PayDunya renvoie autre chose que du JSON (page d'erreur HTML, blocage
// Cloudflare, mauvaise URL selon PAYDUNYA_MODE...), l'exception porte le
// code HTTP + un extrait du corps au lieu d'un simple "Unexpected token '<'"
// impossible à diagnostiquer depuis les logs.
export async function confirmInvoice(token: string): Promise<any> {
  const resp = await fetch(
    `${PAYDUNYA_BASE_URL}/checkout-invoice/confirm/${token}`,
    { headers: paydunyaHeaders },
  );
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(`confirmInvoice: réponse non-JSON (HTTP ${resp.status}, URL ${PAYDUNYA_BASE_URL}) — ${text.slice(0, 300)}`);
  }
}

// Lit une réponse fetch en JSON sans jamais lever d'exception sur un corps
// non-JSON (page d'erreur HTML, blocage...) — utilisé par disburse() pour
// qu'un problème de redistribution (ex. PER pas encore activé sur le compte
// PayDunya) ne puisse jamais faire planter toute la finalisation : la
// réservation et le reçu du client sont déjà acquis à ce stade, seule la
// redistribution vers la station est en jeu.
async function safeJson(resp: Response): Promise<{ ok: true; body: any } | { ok: false; status: number; text: string }> {
  const text = await resp.text();
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch (_) {
    return { ok: false, status: resp.status, text: text.slice(0, 300) };
  }
}

// ─── Redistribution PER (disburse) ───────────────────────────────────--
// Flux documenté en 2 temps : get-invoice (obtient un jeton) puis
// submit-invoice (exécute). withdraw_mode "paydunya" => les fonds vont sur
// le compte PayDunya de la station (elle les retire ensuite vers Orange
// Money / Wave / banque quand elle veut, indépendamment de la plateforme).
//
// Ne lève JAMAIS d'exception : renvoie toujours { ok, step, detail }, même
// si PayDunya répond par autre chose que du JSON (l'API PER peut ne pas
// être activée sur le compte marchand, par exemple).
export async function disburse(opts: {
  accountAlias: string;
  amount: number;
  withdrawMode?: string;
}): Promise<{ ok: boolean; step: string; detail: string }> {
  const getResp = await fetch(`${PAYDUNYA_BASE_URL}/disburse/get-invoice`, {
    method: "POST",
    headers: paydunyaHeaders,
    body: JSON.stringify({
      account_alias: opts.accountAlias,
      amount: opts.amount,
      withdraw_mode: opts.withdrawMode ?? "paydunya",
    }),
  });
  const getResult = await safeJson(getResp);
  if (!getResult.ok) {
    return {
      ok: false,
      step: "get-invoice",
      detail: `réponse non-JSON (HTTP ${getResult.status}) — ${getResult.text}`,
    };
  }
  const got = getResult.body;
  if (got?.response_code !== "00" || !got?.disburse_token) {
    return {
      ok: false,
      step: "get-invoice",
      detail: got?.response_text ?? JSON.stringify(got),
    };
  }

  const subResp = await fetch(`${PAYDUNYA_BASE_URL}/disburse/submit-invoice`, {
    method: "POST",
    headers: paydunyaHeaders,
    body: JSON.stringify({
      disburse_invoice: got.disburse_token,
      disburse_id: opts.accountAlias,
    }),
  });
  const subResult = await safeJson(subResp);
  if (!subResult.ok) {
    return {
      ok: false,
      step: "submit-invoice",
      detail: `réponse non-JSON (HTTP ${subResult.status}) — ${subResult.text}`,
    };
  }
  const sub = subResult.body;
  return {
    ok: sub?.response_code === "00",
    step: "submit-invoice",
    detail: sub?.response_text ?? JSON.stringify(sub),
  };
}
