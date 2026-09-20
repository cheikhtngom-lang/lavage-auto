// Analyste IA du groupe — appelée par le chef d'entreprise depuis /groupe/analyse
// (supabase.functions.invoke('group-ai', { body })). verify_jwt reste à true :
// compte connecté obligatoire.
//
//   { action: 'report', from, to, stationIds?, periodLabel }
//        -> rapport d'analyse structuré de la période
//   { action: 'ask', from, to, stationIds?, periodLabel, question, history? }
//        -> réponse à une question libre, à partir des mêmes chiffres
//
// Voir _shared/groupAiHandlers.ts (garde-fous, limite mensuelle, erreurs) et
// add_group_ai.sql. L'IA ne reçoit que des chiffres agrégés.

import { handleUser } from "../_shared/groupAiHandlers.ts";
import { makeDeps } from "../_shared/groupAiRuntime.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const deps = makeDeps();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const res = await handleUser(deps, req.headers.get("Authorization") ?? "", body);
    return json(res.body, res.status);
  } catch (err) {
    console.error("group-ai:", err);
    return json({ error: "ia_erreur", message: "L'analyse a échoué. Réessayez." }, 500);
  }
});
