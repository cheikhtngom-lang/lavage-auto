// Rapport hebdomadaire automatique de l'IA pour chaque groupe Sur mesure.
// Déclenchée chaque lundi par pg_cron (voir la requête cron.schedule fournie
// à part — elle embarque CRON_SECRET, donc jamais commitée), comme
// send-retention-reminders. N'est JAMAIS appelée depuis le navigateur.
//
// verify_jwt = false (voir supabase/config.toml) : l'appel de pg_cron ne porte
// pas de JWT Supabase mais « Authorization: Bearer <CRON_SECRET> », vérifié
// dans le gestionnaire.
//
// Idempotente : un seul rapport par groupe et par semaine (index unique
// group_ai_weekly_once). Le cron est lancé 3 fois de suite le lundi : chaque
// passage traite au plus ~100 s de groupes, les suivants reprennent le reste.
// Ne compte pas dans la limite mensuelle du groupe.

import { handleWeekly } from "../_shared/groupAiHandlers.ts";
import { makeDeps } from "../_shared/groupAiRuntime.ts";

const deps = makeDeps();

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const res = await handleWeekly(deps, req.headers.get("Authorization") ?? "");
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("group-ai-weekly:", err);
    return new Response(JSON.stringify({ error: "Erreur serveur." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
