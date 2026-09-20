// Cession d'une station — actions qui exigent un compte connecté. Voir
// add_station_transfer.sql pour le modèle complet.
//
//   { action: 'cede',   requestId }  -> le PROPRIÉTAIRE cède sa station : son
//        compte est détaché (redevient automobiliste) et un lien d'activation
//        valable 7 jours part par email vers l'acquéreur.
//   { action: 'reject', requestId }  -> le propriétaire refuse la cession.
//   { action: 'resend', requestId }  -> le SUPER ADMIN génère un nouveau lien
//        pour une station déjà cédée mais pas encore activée (lien expiré,
//        email perdu…).
//
// Autorisation : l'identité vient du JWT. Chaque fonction SQL revérifie que
// l'appelant est bien le propriétaire enregistré sur la demande.
//
// Secrets : RESEND_API_KEY, RESEND_FROM (optionnel), APP_BASE_URL — déjà en
// place pour invite-station-member. SUPABASE_* injectés.

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
async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function transferEmail(acquirerName: string, stationName: string, link: string) {
  return {
    subject: `Vous devenez propriétaire de ${stationName} sur Clean Car Galsen`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h1 style="font-size:20px;color:#2563eb;">Bonjour ${esc(acquirerName)},</h1>
        <p style="font-size:15px;line-height:1.5;">
          La station <strong>${esc(stationName)}</strong> vous a été cédée sur Clean Car Galsen.
          Toutes ses données (clients, historique, équipe) restent en place.
        </p>
        <p style="font-size:15px;line-height:1.5;">
          Cliquez ci-dessous pour choisir votre email de connexion et votre mot de passe,
          et prendre la main sur la station.
        </p>
        <p style="margin:24px 0;">
          <a href="${link}"
             style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">
            Activer mon compte
          </a>
        </p>
        <p style="font-size:13px;color:#666;">Ce lien expire dans 7 jours. Si vous n'attendiez pas ce message, ignorez-le.</p>
        <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
      </div>
    `,
  };
}

// Génère un lien et l'envoie. Ne lève jamais : si l'email échoue, on renvoie
// le lien pour un partage manuel (même choix que invite-station-member).
async function sendLink(acquirerName: string, acquirerEmail: string, stationName: string, token: string) {
  const link = `${APP_BASE_URL}/accept-transfer.html?token=${encodeURIComponent(token)}`;
  if (!RESEND_API_KEY) return { emailSent: false, link };
  try {
    const { subject, html } = transferEmail(acquirerName, stationName, link);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: acquirerEmail, subject, html }),
    });
    if (!r.ok) {
      console.error("station-transfer email:", await r.text());
      return { emailSent: false, link };
    }
    return { emailSent: true, link };
  } catch (err) {
    console.error("station-transfer email:", err);
    return { emailSent: false, link };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { action, requestId } = await req.json();
    if (!requestId) return json({ error: "Demande manquante." }, 400);

    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await caller.auth.getUser();
    if (callerErr || !callerData?.user) return json({ error: "Non autorisé." }, 401);
    const callerId = callerData.user.id;

    const { data: callerProfile } = await admin
      .from("profiles").select("role").eq("id", callerId).single();

    if (action === "reject") {
      if (callerProfile?.role !== "admin") return json({ error: "Réservé au propriétaire de la station." }, 403);
      const { error } = await admin.rpc("reject_station_transfer", { p_request_id: requestId, p_seller_id: callerId });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "cede") {
      // Le rôle 'admin' est exigé : un collaborateur 'staff' ne cède jamais la station.
      if (callerProfile?.role !== "admin") return json({ error: "Réservé au propriétaire de la station." }, 403);

      const token = makeToken();
      const { data: req0, error } = await admin.rpc("cede_station_transfer", {
        p_request_id: requestId, p_seller_id: callerId, p_token_hash: await sha256Hex(token),
      });
      if (error || !req0) return json({ error: error?.message || "Cession impossible." }, 400);

      // Le compte du cédant est déjà détaché : quoi qu'il arrive à l'email,
      // la cession est actée (le Super Admin peut renvoyer le lien).
      const sent = await sendLink(req0.acquirer_name, req0.acquirer_email, req0.station_name, token);
      return json({ ok: true, emailSent: sent.emailSent });
    }

    if (action === "resend") {
      if (callerProfile?.role !== "super_admin") return json({ error: "Réservé au Super Admin." }, 403);

      const token = makeToken();
      const { data: req0, error } = await admin.rpc("renew_station_transfer_link", {
        p_request_id: requestId, p_token_hash: await sha256Hex(token),
      });
      if (error || !req0) return json({ error: error?.message || "Impossible de renvoyer le lien." }, 400);

      const sent = await sendLink(req0.acquirer_name, req0.acquirer_email, req0.station_name, token);
      // Le lien n'est renvoyé au navigateur que si l'email a échoué, pour un
      // partage manuel par le Super Admin.
      return json({ ok: true, emailSent: sent.emailSent, link: sent.emailSent ? undefined : sent.link });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (err) {
    console.error("station-transfer:", err);
    return json({ error: "Une erreur est survenue. Réessayez plus tard." }, 500);
  }
});
