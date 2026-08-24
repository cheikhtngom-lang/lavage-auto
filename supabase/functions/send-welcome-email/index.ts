// Envoie l'email de bienvenue (immédiat, un seul CTA) juste après une
// inscription réussie — appelée par src/lib/accounts.js (createClientAccount
// / createStationAccount) via supabase.functions.invoke('send-welcome-email').
// Idempotent (welcome_email_sent_at) : ne renvoie jamais deux fois.
//
// Secrets requis (Supabase Dashboard > Edge Functions > Manage secrets) :
//   RESEND_API_KEY  — clé API Resend
//   RESEND_FROM     — optionnel, défaut "Clean Car Galsen <onboarding@resend.dev>"
//   APP_BASE_URL    — URL du site (ex: https://xxx.vercel.app), pour les liens dans l'email
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement par Supabase.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";
const APP_BASE_URL = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function clientEmail(fullName: string | null) {
  const first = (fullName || "").split(" ")[0] || "";
  return {
    subject: "Bienvenue chez Clean Car Galsen 🚗",
    html: `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h1 style="font-size:20px;color:#059669;">Bienvenue${first ? `, ${first}` : ""} !</h1>
        <p style="font-size:15px;line-height:1.5;">
          Votre compte Clean Car Galsen est prêt. Trouvez une station près de vous
          et réservez votre premier lavage en quelques secondes.
        </p>
        <p style="margin:24px 0;">
          <a href="${APP_BASE_URL}/dashboard/stations?onboarding=1"
             style="background:#059669;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">
            Réserver mon premier lavage
          </a>
        </p>
        <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
      </div>
    `,
  };
}

function stationEmail(fullName: string | null) {
  const first = (fullName || "").split(" ")[0] || "";
  return {
    subject: "Votre station est prête — ajoutez votre premier laveur",
    html: `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#111;">
        <h1 style="font-size:20px;color:#2563eb;">Bienvenue${first ? `, ${first}` : ""} !</h1>
        <p style="font-size:15px;line-height:1.5;">
          Votre station est active sur Clean Car Galsen. Il ne reste qu'une étape
          avant de pouvoir démarrer votre premier lavage : ajouter votre premier laveur.
        </p>
        <p style="margin:24px 0;">
          <a href="${APP_BASE_URL}/admin/team"
             style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">
            Ajouter mon premier laveur
          </a>
        </p>
        <p style="font-size:13px;color:#666;">— L'équipe Clean Car Galsen</p>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  try {
    const { profileId } = await req.json();
    if (!profileId) return new Response(JSON.stringify({ error: "profileId manquant" }), { status: 400 });

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, role, full_name, email, welcome_email_sent_at")
      .eq("id", profileId)
      .single();
    if (error || !profile) return new Response(JSON.stringify({ error: "Profil introuvable" }), { status: 404 });
    if (profile.welcome_email_sent_at) return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    if (!profile.email) return new Response(JSON.stringify({ error: "Pas d'email sur ce profil" }), { status: 400 });

    const { subject, html } = profile.role === "admin" ? stationEmail(profile.full_name) : clientEmail(profile.full_name);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: profile.email, subject, html }),
    });
    if (!resendRes.ok) {
      const detail = await resendRes.text();
      return new Response(JSON.stringify({ error: "Resend a refusé l'envoi", detail }), { status: 502 });
    }

    await supabase.from("profiles").update({ welcome_email_sent_at: new Date().toISOString() }).eq("id", profileId);
    return new Response(JSON.stringify({ sent: true }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
});
