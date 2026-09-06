// Invite un collaborateur dans une station : crée (ou réutilise) la ligne
// station_members en statut 'invited', génère un token d'invitation et envoie
// l'email avec le lien vers /accept-invitation.html?token=...
//
// Appelée depuis src/lib/stationTeam.js via supabase.functions.invoke(
//   'invite-station-member', { body: { email, fullName, roleId } }).
//
// Autorisation : le compte appelant doit être le propriétaire de la station
// (profiles.role = 'admin') OU un membre 'staff' possédant la permission
// 'team.manage' (vérifié via la fonction SQL has_station_perm).
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
    const { email: rawEmail, fullName: rawName, roleId } = await req.json();
    const email = String(rawEmail || "").trim().toLowerCase();
    const fullName = String(rawName || "").trim();
    if (!email || !email.includes("@")) return json({ error: "Email invalide." }, 400);
    if (!roleId) return json({ error: "Rôle manquant." }, 400);

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
    if (!callerProfile?.station_id) return json({ error: "Aucune station rattachée à ce compte." }, 403);
    const stationId = callerProfile.station_id;

    if (callerProfile.role !== "admin") {
      const { data: canManage } = await caller.rpc("has_station_perm", { perm: "team.manage" });
      if (!canManage) return json({ error: "Vous n'avez pas le droit de gérer l'équipe." }, 403);
    }

    // ── Le rôle demandé appartient bien à cette station ──────────────
    const { data: role } = await admin
      .from("station_roles").select("id, key, name, permissions")
      .eq("id", roleId).eq("station_id", stationId).single();
    if (!role) return json({ error: "Rôle introuvable pour cette station." }, 400);

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
      if (insErr || !created) return json({ error: "Création du membre impossible.", detail: insErr?.message }, 500);
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
    if (invErr) return json({ error: "Création de l'invitation impossible.", detail: invErr.message }, 500);

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
        return json({ ok: true, emailSent: false, link, warning: "Email non envoyé", detail }, 200);
      }
    }

    return json({ ok: true, emailSent: Boolean(RESEND_API_KEY), memberId, link });
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
