// E-mail d'activation d'un compte station ou pressing (add_pressing_signup_activation.sql).
// Appelée par src/lib/accounts.js juste après l'inscription, et par le bouton
// « Renvoyer l'e-mail » de login.html, avec la session du compte concerné.
//
// Le jeton (32 octets aléatoires) part seulement dans l'e-mail ; la base n'en
// garde que l'empreinte SHA-256, valable 48 h, consommée par activate_account()
// depuis activer.html. Un envoi par minute au plus, 6 par jour.
//
// Secrets (les mêmes que send-welcome-email) : RESEND_API_KEY, RESEND_FROM,
// APP_BASE_URL. SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
// sont injectés automatiquement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Galsen Auto Cleaner <onboarding@resend.dev>";
const APP_BASE_URL = (Deno.env.get("APP_BASE_URL") ?? "https://galsenautocleaner.com").replace(/\/+$/, "");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function activationEmail(firstName: string, place: string, kind: string, link: string) {
  const what = kind === "pressing" ? "votre pressing" : "votre station de lavage";
  return {
    subject: `Activez votre compte Galsen${place ? ` — ${place}` : ""}`,
    html: `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:480px;margin:0 auto;color:#0f1b2d;">
        <h1 style="font-size:20px;color:#0b63e5;margin:0 0 12px;">Bonjour${firstName ? ` ${esc(firstName)}` : ""},</h1>
        <p style="font-size:15px;line-height:1.55;margin:0 0 8px;">
          Confirmez votre adresse e-mail pour ouvrir ${what}${place ? ` « ${esc(place)} »` : ""} sur Galsen Auto Cleaner.
        </p>
        <p style="margin:24px 0;">
          <a href="${link}" style="background:#0b63e5;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:600;display:inline-block;">
            Activer mon compte
          </a>
        </p>
        <p style="font-size:13px;line-height:1.5;color:#556070;margin:0 0 6px;">Le lien est valable 48 heures. Vos 7 jours d'essai gratuit commencent à l'inscription.</p>
        <p style="font-size:13px;line-height:1.5;color:#556070;margin:0 0 6px;">Si le bouton ne marche pas, copiez ce lien dans votre navigateur :<br><span style="word-break:break-all;color:#0b63e5;">${link}</span></p>
        <p style="font-size:13px;color:#556070;margin:18px 0 0;">Vous n'avez rien demandé ? Ignorez cet e-mail.<br>— L'équipe Galsen Auto Cleaner</p>
      </div>
    `,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    // Le compte qui appelle est celui qu'on active : jamais un autre.
    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: callerData, error: callerError } = await callerClient.auth.getUser();
    const userId = callerData?.user?.id;
    if (callerError || !userId) return json({ error: "Non autorisé" }, 401);

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, full_name, email, station_id, activation_required, activated_at")
      .eq("id", userId)
      .maybeSingle();
    if (!profile) return json({ error: "Profil introuvable" }, 404);
    if (!profile.activation_required || profile.activated_at) return json({ already: true });
    if (!profile.email) return json({ error: "Pas d'e-mail sur ce compte" }, 400);

    const { data: recent } = await admin
      .from("account_activation_tokens")
      .select("created_at")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
      .order("created_at", { ascending: false });
    const last = recent?.[0]?.created_at ? new Date(recent[0].created_at).getTime() : 0;
    const waitS = Math.ceil((last + 60_000 - Date.now()) / 1000);
    if (waitS > 0) return json({ error: `Patientez ${waitS} s avant un nouvel envoi.`, wait: waitS }, 429);
    if ((recent?.length ?? 0) >= 6) return json({ error: "Trop d'envois aujourd'hui. Réessayez demain ou écrivez-nous." }, 429);

    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256Hex(token);
    const { error: insErr } = await admin.from("account_activation_tokens").insert({
      token_hash: tokenHash,
      user_id: userId,
      expires_at: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    });
    if (insErr) throw insErr;

    const { data: station } = profile.station_id
      ? await admin.from("stations").select("name, business_type").eq("id", profile.station_id).maybeSingle()
      : { data: null };
    const firstName = (profile.full_name || "").split(" ")[0] || "";
    const link = `${APP_BASE_URL}/activer.html?t=${token}`;
    const { subject, html } = activationEmail(firstName, station?.name || "", station?.business_type || "lavage", link);

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: profile.email, subject, html }),
    });
    if (!resendRes.ok) {
      console.error("send-activation-email Resend:", await resendRes.text());
      await admin.from("account_activation_tokens").delete().eq("token_hash", tokenHash);
      return json({ error: "L'e-mail n'a pas pu partir. Réessayez dans un instant." }, 502);
    }
    return json({ sent: true, email: profile.email });
  } catch (err) {
    console.error("send-activation-email:", err);
    return json({ error: "Une erreur est survenue. Réessayez plus tard." }, 500);
  }
});
