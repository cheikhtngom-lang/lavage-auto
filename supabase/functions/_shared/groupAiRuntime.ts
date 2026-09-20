// supabase/functions/_shared/groupAiRuntime.ts
//
// Câblage RÉEL des dépendances de groupAiHandlers.ts : Supabase, SDK Anthropic
// officiel et Resend. Partagé par group-ai et group-ai-weekly.
//
// Secrets (Supabase > Edge Functions > Manage secrets) :
//   ANTHROPIC_API_KEY   clé de l'API Claude — SANS elle, l'analyse IA reste
//                       désactivée (les fonctions répondent « ia_non_configuree »)
//   ANTHROPIC_MODEL     optionnel, défaut claude-opus-5 (claude-sonnet-5 = ~2,5x moins cher)
//   CRON_SECRET, RESEND_API_KEY, RESEND_FROM, APP_BASE_URL : déjà en place
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY : injectés.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.127.0";
import { DEFAULT_MODEL } from "./groupAi.ts";
import type { AskParams, AskResult, Deps } from "./groupAiHandlers.ts";

class RefusalError extends Error {
  name = "RefusalError";
}

function makeAsk(apiKey: string, model: string) {
  // Une seule reprise automatique (limite de débit, coupure) ; au-delà, on
  // remonte l'erreur au patron plutôt que de rester bloqué.
  const client = new Anthropic({ apiKey, timeout: 110_000, maxRetries: 1 });

  return async (p: AskParams): Promise<AskResult> => {
    const params = {
      model,
      max_tokens: p.maxTokens,
      // Consignes fixes d'abord, données du groupe ensuite : le bloc de données
      // est mis en cache, ce qui rend les questions suivantes sur la même
      // période moins chères (sans effet si le préfixe est trop court).
      system: p.system.map((b) => ({
        type: "text" as const,
        text: b.text,
        ...(b.cache ? { cache_control: { type: "ephemeral" as const } } : {}),
      })),
      messages: p.messages,
      output_config: { effort: p.effort },
    };

    // Repli côté serveur si les filtres de sécurité déclinent une requête
    // (option recommandée pour claude-opus-5). Si le compte ou la région ne
    // l'accepte pas (400 qui cite « fallback »), on rejoue sans.
    let msg: any;
    try {
      msg = await client.beta.messages.create({
        ...params,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      } as any);
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && /fallback/i.test(String(e.message))) {
        msg = await client.messages.create(params as any);
      } else {
        throw e;
      }
    }

    // Toujours regarder stop_reason AVANT de lire le contenu.
    if (msg.stop_reason === "refusal") throw new RefusalError("refus");
    const text = (msg.content as { type: string; text?: string }[])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("\n")
      .trim();
    return {
      text,
      model: msg.model ?? model,
      inputTokens: (msg.usage?.input_tokens ?? 0) + (msg.usage?.cache_read_input_tokens ?? 0) + (msg.usage?.cache_creation_input_tokens ?? 0),
      outputTokens: msg.usage?.output_tokens ?? 0,
      truncated: msg.stop_reason === "max_tokens",
    };
  };
}

export function makeDeps(): Deps {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const model = Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODEL;

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";

  const asUser = (authHeader: string) =>
    createClient(url, anon, { global: { headers: { Authorization: authHeader } } });

  return {
    now: () => new Date(),
    aiConfigured: apiKey.length > 0,
    cronSecret: Deno.env.get("CRON_SECRET") ?? "",
    appBaseUrl: Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173",

    async getUser(authHeader) {
      const { data, error } = await asUser(authHeader).auth.getUser();
      return error || !data?.user ? null : { id: data.user.id };
    },
    // async/await : de vraies Promise (le builder Supabase n'expose que then()).
    userRpc: async (authHeader, fn, args) => (await asUser(authHeader).rpc(fn, args)) as any,
    adminRpc: async (fn, args) => (await admin.rpc(fn, args)) as any,

    // Groupes qui ont au moins une station active (sinon, rien à analyser).
    async listWeeklyTargets() {
      const { data: active } = await admin.from("stations").select("organization_id")
        .not("organization_id", "is", null).is("group_archived_at", null).eq("status", "active");
      const activeOrgs = new Set((active || []).map((s: { organization_id: string }) => s.organization_id));
      if (activeOrgs.size === 0) return [];
      const { data: orgs } = await admin.from("organizations").select("id, name, owner_id").in("id", [...activeOrgs]);
      const ownerIds = (orgs || []).map((o: { owner_id: string }) => o.owner_id);
      const { data: owners } = await admin.from("profiles").select("id, email").in("id", ownerIds);
      const emailOf = new Map((owners || []).map((p: { id: string; email: string | null }) => [p.id, p.email]));
      return (orgs || []).map((o: { id: string; name: string; owner_id: string }) => ({
        orgId: o.id, orgName: o.name, ownerEmail: emailOf.get(o.owner_id) ?? null,
      }));
    },

    ask: apiKey ? makeAsk(apiKey, model) : async () => { throw new Error("ia_non_configuree"); },

    async sendEmail(to, subject, html) {
      if (!RESEND_API_KEY) return false;
      try {
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
        });
        return r.ok;
      } catch (_) {
        return false;
      }
    },

    log: (msg, err) => console.error(msg, err instanceof Error ? `${err.name}: ${err.message}` : err ?? ""),
  };
}
