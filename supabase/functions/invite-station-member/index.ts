// Invite un collaborateur dans une station : crée (ou réutilise) la ligne
// station_members en statut 'invited', génère un token d'invitation et envoie
// l'email avec le lien vers /accept-invitation.html?token=...
//
// Appelée depuis src/lib/stationTeam.js via supabase.functions.invoke(
//   'invite-station-member', { body: { email, fullName, roleId } }).
//
// Autorisation : le compte appelant doit être le propriétaire de la station
// (profiles.role = 'admin') OU un membre 'staff' possédant la permission
// 'team.manage' (vérifié via la fonction SQL has_station_perm) OU le chef
// d'entreprise d'un groupe Sur mesure, qui peut viser n'importe quelle station
// de son groupe avec `stationId` sans l'ouvrir (voir add_sur_mesure_groups.sql).
//
// Le rôle 'super_admin_station' (un seul par station) ne peut être attribué
// que par le propriétaire / le patron, jamais par un collaborateur : sans ça
// un Super Admin pourrait en nommer d'autres et le patron perdrait le contrôle.
// Le rôle peut être donné par `roleId` ou par `roleKey` (ex. 'super_admin_station'),
// ce dernier évitant au patron de lire le catalogue de rôles d'une autre station.
//
// Secrets requis (Supabase > Edge Functions > Manage secrets) — déjà en place
// pour send-welcome-email :
//   RESEND_API_KEY, RESEND_FROM (optionnel), APP_BASE_URL
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY : injectés.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// "Supports" — comptes pouvant se connecter à la station, propriétaire
// compris. Mêmes valeurs que src/lib/planLimits.js (TEAM_SEAT_LIMITS) et le
// trigger Postgres enforce_team_seat_limit (add_plan_gating.sql), qui reste
// la vraie barrière si cet Edge Function est contourné.
const TEAM_SEAT_LIMITS: Record<string, number> = { Starter: 3, Pro: 5, Business: 9999 };

function makeToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function inviteEmail(stationName: string, roleName: string, link: string) {
  return {
    subject: `Rejoignez l'équipe ${stationName} sur Clean Car Galsen`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h1 style="font-size:20px;color:#2563eb;">Vous êtes invité·e</h1>
        <p style="font-size:15px;line-height:1.5;">
          <strong>${stationName}</strong> vous invite à rejoindre son espace de gestion
          Clean Car Galsen en tant que <strong>${roleName}</strong>.
        </p>
        <p style="font-size:15px;line-height:1.5;">
          Cliquez ci-dessous pour choisir votre mot de passe et activer votre compte.
        </p>
        <p style="margin:24px 0;">
          <a href="${link}"
             style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">
            Activer mon compte
          </a>
        </p>
        <p style="font-size:13px;color:#666;">Ce lien expire dans 7 jours. Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
        <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { email: rawEmail, fullName: rawName, roleId, roleKey, stationId: reqStationId } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    const fullName = String(rawName || "").trim();
    if (!email || !email.includes("@")) return json({ error: "Email invalide." }, 400);
    if (!roleId && !roleKey) return json({ error: "Rôle manquant." }, 400);

    // ── Autorisation de l'appelant ───────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Non autorisé." }, 401);
    const callerId = callerData.user.id;

    const { data: callerProfile } = await admin
      .from("profiles").select("role, station_id").eq("id", callerId).single();
    let stationId: string | null = callerProfile?.station_id ?? null;
    // Propriétaire / patron : peut attribuer le rôle Super Admin de station.
    let isOwnerLevel = callerProfile?.role === "admin";

    if (reqStationId && reqStationId !== stationId) {
      // Chef d'entreprise qui vise une station de SON groupe sans l'ouvrir.
      const { data: org } = await admin
        .from("organizations").select("id").eq("owner_id", callerId).maybeSingle();
      if (!org) return json({ error: "Non autorisé." }, 403);
      const { data: target } = await admin
        .from("stations").select("id, organization_id, group_archived_at").eq("id", reqStationId).maybeSingle();
      if (!target || target.organization_id !== org.id || target.group_archived_at) {
        return json({ error: "Cette station ne fait pas partie de votre groupe." }, 403);
      }
      stationId = target.id;
      isOwnerLevel = true;
    } else {
      if (!stationId) return json({ error: "Aucune station rattachée à ce compte." }, 403);
      if (callerProfile?.role !== "admin") {
        const { data: canManage } = await caller.rpc("has_station_perm", { perm: "team.manage" });
        if (!canManage) return json({ error: "Vous n'avez pas le droit de gérer l'équipe." }, 403);
      }
    }

    // ── Le rôle demandé appartient bien à cette station ──────────────
    const roleQuery = admin
      .from("station_roles").select("id, key, name, permissions").eq("station_id", stationId);
    const { data: role } = await (roleId ? roleQuery.eq("id", roleId) : roleQuery.eq("key", String(roleKey))).maybeSingle();
    if (!role) return json({ error: "Rôle introuvable pour cette station." }, 400);

    // ── Super Admin de station : un seul, nommé uniquement par le propriétaire/patron ──
    if (role.key === "super_admin_station") {
      if (!isOwnerLevel) {
        return json({ error: "Seul le propriétaire ou le chef d'entreprise peut nommer le Super Admin de la station." }, 403);
      }
      const { data: current } = await admin
        .from("station_members").select("email")
        .eq("station_id", stationId).eq("role_id", role.id).in("status", ["invited", "active"]);
      const other = (current || []).find((m: { email: string }) => m.email !== email);
      if (other) {
        return json({ error: `Cette station a déjà un Super Admin (${other.email}). Retirez-le avant d'en nommer un autre.` }, 409);
      }
    }

    const { data: station } = await admin
      .from("stations").select("name").eq("id", stationId).single();
    const stationName = station?.name || "Votre station";

    // ── Membre : réutilise une invitation en attente, refuse un actif ─
    const { data: existing } = await admin
      .from("station_members").select("id, status, employee_id")
      .eq("station_id", stationId).eq("email", email).maybeSingle();

    if (existing && existing.status === "active") {
      return json({ error: "Cette personne fait déjà partie de l'équipe." }, 409);
    }
    if (existing && existing.status === "suspended") {
      return json({ error: "Ce compte est suspendu. Réactivez-le au lieu de le réinviter." }, 409);
    }

    // ── Plafond de comptes ("supports") du forfait — seulement pertinent
    // pour un TOUT NOUVEAU membre (réinviter un "invited" existant ne prend
    // pas un siège de plus). Le trigger Postgres enforce_team_seat_limit
    // reste la vraie barrière si ce contrôle est contourné.
    if (!existing) {
      const { data: billing } = await admin
        .from("station_billing").select("plan").eq("station_id", stationId).maybeSingle();
      const limit = TEAM_SEAT_LIMITS[billing?.plan ?? "Starter"] ?? TEAM_SEAT_LIMITS.Starter;
      const { count } = await admin
        .from("station_members").select("id", { count: "exact", head: true })
        .eq("station_id", stationId).in("status", ["invited", "active"]);
      if ((count || 0) + 1 >= limit) {
        return json({ error: `Limite de comptes atteinte pour ce forfait (${limit} supports max, propriétaire compris). Passez à un forfait supérieur pour inviter plus de collaborateurs.` }, 403);
      }
    }

    let memberId = existing?.id as string | undefined;
    let employeeId = existing?.employee_id as string | null | undefined;

    if (memberId) {
      await admin.from("station_members")
        .update({ role_id: roleId, full_name: fullName, invited_by: callerId, status: "invited" })
        .eq("id", memberId);
    } else {
      const { data: created, error: insErr } = await admin
        .from("station_members")
        .insert({ station_id: stationId, role_id: roleId, email, full_name: fullName, status: "invited", invited_by: callerId })
        .select("id").single();
      if (insErr || !created) { console.error("invite-station-member membre:", insErr); return json({ error: "Création du membre impossible." }, 500); }
      memberId = created.id;
    }

    // ── Laveur : fiche roster (planning / pointage) créée dès l'invitation ─
    const isWasher = role.key === "laveur" || (role.permissions || []).includes("washer.self");
    if (isWasher && !employeeId) {
      const { data: emp } = await admin
        .from("employees")
        .insert({ station_id: stationId, name: fullName || email, role: "Laveur" })
        .select("id").single();
      if (emp) {
        employeeId = emp.id;
        await admin.from("station_members").update({ employee_id: emp.id }).eq("id", memberId);
      }
    }

    // ── Token d'invitation (on invalide les précédents en attente) ───
    await admin.from("station_invitations")
      .update({ status: "revoked" })
      .eq("member_id", memberId).eq("status", "pending");

    const token = makeToken();
    const { error: invErr } = await admin.from("station_invitations").insert({
      station_id: stationId, member_id: memberId, email, token, status: "pending",
    });
    if (invErr) { console.error("invite-station-member invitation:", invErr); return json({ error: "Création de l'invitation impossible." }, 500); }

    // ── Email ───────────────────────────────────────────────────────
    const link = `${APP_BASE_URL}/accept-invitation.html?token=${encodeURIComponent(token)}`;
    if (RESEND_API_KEY) {
      const { subject, html } = inviteEmail(stationName, role.name, link);
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: RESEND_FROM, to: email, subject, html }),
      });
      if (!r.ok) {
        const detail = await r.text();
        // L'invitation existe en base : on renvoie le lien pour un partage manuel.
        console.error("invite-station-member email:", detail);
        return json({ ok: true, emailSent: false, link, warning: "Email non envoyé" }, 200);
      }
    }

    return json({ ok: true, emailSent: Boolean(RESEND_API_KEY), memberId, link });
  } catch (err) {
    console.error("invite-station-member:", err);
    return json({ error: "Une erreur est survenue. Réessayez plus tard." }, 500);
  }
});
