// supabase/functions/_shared/groupAiHandlers.ts
//
// Gestionnaires de group-ai (patron connecté) et group-ai-weekly (cron du
// lundi). Toutes les dépendances externes (Supabase, API Claude, email) sont
// INJECTÉES (Deps) : le fichier ne fait aucun appel réseau lui-même, ce qui
// permet de le tester avec des doubles. Le câblage réel est dans
// groupAiRuntime.ts.
//
// Garde-fous, dans l'ordre :
//   1. clé Claude absente          → 503 « ia_non_configuree » (rien ne se passe)
//   2. identité                    → JWT du patron ; c'est SQL (group_ai_usage /
//                                    group_dashboard) qui vérifie qu'il est bien
//                                    chef d'entreprise et borne les données à SON groupe
//   3. coût                        → group_ai_begin() réserve la demande sous
//                                    verrou : la limite mensuelle ne peut pas être
//                                    dépassée, même par des requêtes simultanées
//   4. échec de l'API              → group_ai_abort() : la demande ne compte pas

import {
  Dashboard, Turn, SYSTEM_PROMPT, QUESTION_INSTRUCTION,
  buildPayload, dataBlock, reportInstruction, cleanHistory, isEmptyDashboard, lastCompleteWeek, weeklyEmail,
} from "./groupAi.ts";

export interface AskParams {
  system: { text: string; cache?: boolean }[];
  messages: Turn[];
  effort: "low" | "medium" | "high";
  maxTokens: number;
}
export interface AskResult { text: string; model: string; inputTokens: number; outputTokens: number; truncated: boolean }
type Rpc = Promise<{ data: any; error: { message: string; code?: string } | null }>;

export interface Deps {
  now(): Date;
  aiConfigured: boolean;
  cronSecret: string;
  appBaseUrl: string;
  getUser(authHeader: string): Promise<{ id: string } | null>;
  userRpc(authHeader: string, fn: string, args: Record<string, unknown>): Rpc;
  adminRpc(fn: string, args: Record<string, unknown>): Rpc;
  listWeeklyTargets(): Promise<{ orgId: string; orgName: string; ownerEmail: string | null }[]>;
  ask(p: AskParams): Promise<AskResult>;
  sendEmail(to: string, subject: string, html: string): Promise<boolean>;
  log(msg: string, err?: unknown): void;
}
export type Result = { status: number; body: Record<string, unknown> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY = 86400000;

// Même règle que le navigateur (lib/groupDashboard.js:bucketFor).
function bucketFor(from: Date, to: Date) {
  const days = (+to - +from) / DAY;
  return days <= 45 ? "day" : days <= 190 ? "week" : "month";
}

function parseDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(+d) ? null : d;
}

// Traduit une erreur de l'API Claude en réponse claire pour le patron.
export function mapClaudeError(e: any, log: Deps["log"]): Result {
  log("group-ai: erreur API Claude", e);
  if (e?.name === "RefusalError") {
    return { status: 422, body: { error: "refus", message: "L'analyse n'a pas pu être produite pour cette demande. Reformulez votre question." } };
  }
  const status = Number(e?.status) || 0;
  if (status === 429) return { status: 429, body: { error: "ia_saturee", message: "Le service d'analyse est très sollicité. Réessayez dans une minute." } };
  if (status === 401 || status === 403) return { status: 500, body: { error: "ia_config", message: "L'analyse IA est mal configurée. L'administrateur de la plateforme a été prévenu." } };
  if (status === 529 || status >= 500) return { status: 502, body: { error: "ia_indisponible", message: "Le service d'analyse est momentanément indisponible. Réessayez plus tard." } };
  if (/timeout/i.test(String(e?.name)) || /timed? ?out/i.test(String(e?.message))) return { status: 504, body: { error: "ia_delai", message: "L'analyse a pris trop de temps. Réessayez avec une période plus courte." } };
  return { status: 500, body: { error: "ia_erreur", message: "L'analyse a échoué. Réessayez." } };
}

// ─── Patron : rapport à la demande ou question libre ────────────────
export async function handleUser(deps: Deps, authHeader: string, body: any): Promise<Result> {
  if (!deps.aiConfigured) return { status: 503, body: { error: "ia_non_configuree" } };

  const user = await deps.getUser(authHeader);
  if (!user) return { status: 401, body: { error: "Non autorisé." } };

  const action = body?.action;
  if (action !== "report" && action !== "ask") return { status: 400, body: { error: "Action inconnue." } };

  const from = parseDate(body?.from), to = parseDate(body?.to);
  if (!from || !to || +to <= +from || +to - +from > 400 * DAY) return { status: 400, body: { error: "Période invalide." } };

  let stationIds: string[] | null = null;
  if (Array.isArray(body?.stationIds) && body.stationIds.length) {
    if (body.stationIds.length > 100 || !body.stationIds.every((x: unknown) => typeof x === "string" && UUID.test(x))) {
      return { status: 400, body: { error: "Filtre de stations invalide." } };
    }
    stationIds = body.stationIds;
  }

  const question = action === "ask" ? String(body?.question ?? "").trim() : "";
  if (action === "ask" && (question.length < 3 || question.length > 600)) {
    return { status: 400, body: { error: "La question doit faire entre 3 et 600 caractères." } };
  }
  const periodLabel = String(body?.periodLabel ?? "").trim().slice(0, 80) || "la période choisie";

  // Identité + limite (SQL vérifie que l'appelant est bien chef d'entreprise).
  const usageRes = await deps.userRpc(authHeader, "group_ai_usage", {});
  if (usageRes.error) {
    const forbidden = usageRes.error.code === "42501";
    return { status: forbidden ? 403 : 400, body: { error: forbidden ? "Réservé au chef d'entreprise." : usageRes.error.message } };
  }
  const { org_id: orgId, org_name: orgName, used, limit } = usageRes.data;
  if (used >= limit) return { status: 429, body: { error: "limite_atteinte", used, limit } };

  // Chiffres du groupe (borné à SON groupe par la fonction SQL).
  const dashRes = await deps.userRpc(authHeader, "group_dashboard", {
    p_from: from.toISOString(), p_to: to.toISOString(), p_station_ids: stationIds, p_bucket: bucketFor(from, to),
  });
  if (dashRes.error) return { status: 400, body: { error: dashRes.error.message } };
  const dash = dashRes.data as Dashboard;
  if (isEmptyDashboard(dash)) {
    return { status: 422, body: { error: "aucune_donnee", message: "Aucune activité à analyser sur cette période (ou aucune station sélectionnée)." } };
  }

  // Réservation sous verrou : c'est elle qui borne le coût.
  const begin = await deps.adminRpc("group_ai_begin", {
    p_org: orgId, p_kind: action === "report" ? "report" : "question", p_from: from.toISOString(), p_to: to.toISOString(),
    p_label: periodLabel, p_station_ids: stationIds, p_question: question || null, p_user: user.id,
  });
  if (begin.error) {
    if (String(begin.error.message).includes("AI_LIMIT_REACHED")) return { status: 429, body: { error: "limite_atteinte", used: limit, limit } };
    deps.log("group-ai: group_ai_begin", begin.error);
    return { status: 500, body: { error: "ia_erreur", message: "L'analyse a échoué. Réessayez." } };
  }
  const id = begin.data as string;

  try {
    const payload = buildPayload(dash, { orgName, periodLabel });
    const messages: Turn[] = action === "report"
      ? [{ role: "user", content: reportInstruction("report", periodLabel) }]
      : [...cleanHistory(body?.history), { role: "user", content: `${question}\n\n${QUESTION_INSTRUCTION}` }];
    const res = await deps.ask({
      system: [{ text: SYSTEM_PROMPT }, { text: dataBlock(payload), cache: true }],
      messages, effort: "medium", maxTokens: action === "report" ? 4000 : 2500,
    });
    const answer = res.text + (res.truncated ? "\n\n(Réponse tronquée : posez une question plus précise.)" : "");
    if (!answer.trim()) throw Object.assign(new Error("réponse vide"), { status: 502 });
    await deps.adminRpc("group_ai_finish", { p_id: id, p_answer: answer, p_model: res.model, p_in: res.inputTokens, p_out: res.outputTokens });
    return { status: 200, body: { ok: true, id, answer, model: res.model, usage: { used: used + 1, limit } } };
  } catch (e) {
    await deps.adminRpc("group_ai_abort", { p_id: id }).catch(() => {}); // la demande ne compte pas
    return mapClaudeError(e, deps.log);
  }
}

// ─── Cron du lundi : rapport hebdomadaire de chaque groupe ──────────
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function handleWeekly(deps: Deps, authHeader: string): Promise<Result> {
  if (!deps.cronSecret || !sameSecret(authHeader, `Bearer ${deps.cronSecret}`)) return { status: 401, body: { error: "Non autorisé." } };
  if (!deps.aiConfigured) return { status: 200, body: { skipped: "ia_non_configuree" } };

  const week = lastCompleteWeek(deps.now());
  const targets = await deps.listWeeklyTargets();
  const startedAt = deps.now().getTime();
  const BUDGET_MS = 100_000; // la fonction est limitée à ~150 s : les groupes restants passent au tir suivant
  const summary = { generated: 0, already_done: 0, no_activity: 0, failed: 0, deferred: 0, emailed: 0 };

  for (const t of targets) {
    if (deps.now().getTime() - startedAt > BUDGET_MS) { summary.deferred++; continue; }
    let id: string | null = null;
    try {
      const begin = await deps.adminRpc("group_ai_begin", {
        p_org: t.orgId, p_kind: "weekly", p_from: week.from.toISOString(), p_to: week.to.toISOString(),
        p_label: week.label, p_station_ids: null, p_question: null, p_user: null,
      });
      if (begin.error) { deps.log("weekly: group_ai_begin", begin.error); summary.failed++; continue; }
      if (!begin.data) { summary.already_done++; continue; }
      id = begin.data as string;

      const dashRes = await deps.adminRpc("group_dashboard_for_org", {
        p_org: t.orgId, p_from: week.from.toISOString(), p_to: week.to.toISOString(), p_station_ids: null, p_bucket: "day",
      });
      if (dashRes.error) throw Object.assign(new Error(dashRes.error.message), { status: 500 });
      const dash = dashRes.data as Dashboard;
      if (isEmptyDashboard(dash)) {
        await deps.adminRpc("group_ai_abort", { p_id: id });
        id = null;
        summary.no_activity++;
        continue;
      }

      const res = await deps.ask({
        system: [{ text: SYSTEM_PROMPT }, { text: dataBlock(buildPayload(dash, { orgName: t.orgName, periodLabel: week.label })), cache: true }],
        messages: [{ role: "user", content: reportInstruction("weekly", week.label) }],
        effort: "medium", maxTokens: 4000,
      });
      if (!res.text.trim()) throw Object.assign(new Error("réponse vide"), { status: 502 });
      await deps.adminRpc("group_ai_finish", { p_id: id, p_answer: res.text, p_model: res.model, p_in: res.inputTokens, p_out: res.outputTokens });
      id = null;
      summary.generated++;

      if (t.ownerEmail) {
        const mail = weeklyEmail(t.orgName, week.label, res.text, `${deps.appBaseUrl}/groupe/analyse`);
        if (await deps.sendEmail(t.ownerEmail, mail.subject, mail.html)) summary.emailed++;
      }
    } catch (e) {
      deps.log(`weekly: échec pour le groupe ${t.orgId}`, e);
      if (id) await deps.adminRpc("group_ai_abort", { p_id: id }).catch(() => {});
      summary.failed++;
    }
  }
  return { status: 200, body: { ok: true, week: week.label, ...summary } };
}
