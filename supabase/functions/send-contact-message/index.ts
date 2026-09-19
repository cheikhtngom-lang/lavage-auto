// Reçoit le formulaire « Contact » du footer public (src/contact-modal.js) :
// valide, enregistre dans contact_messages puis prévient l'équipe par email
// (Resend). Appelée par des visiteurs NON connectés : verify_jwt = false
// (voir supabase/config.toml) — la protection est faite ici :
//   - honeypot + temps de remplissage minimum (robots),
//   - validation stricte des longueurs et du sujet,
//   - limite de débit par IP hashée (5 messages / heure), l'IP en clair
//     n'est jamais stockée,
//   - échappement HTML de tout ce que le visiteur a saisi avant de le
//     mettre dans l'email.
// Purge au passage les messages de plus de 12 mois (durée de conservation
// annoncée dans confidentialite.html).
//
// Secrets (Supabase > Edge Functions > Manage secrets) :
//   RESEND_API_KEY     — déjà utilisé par send-welcome-email
//   RESEND_FROM        — optionnel, défaut "Clean Car Galsen <onboarding@resend.dev>"
//   CONTACT_TO_EMAIL   — optionnel, destinataire des messages
//                        (défaut bustaneimmo2021@gmail.com)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Clean Car Galsen <onboarding@resend.dev>";
const CONTACT_TO_EMAIL = Deno.env.get("CONTACT_TO_EMAIL") ?? "bustaneimmo2021@gmail.com";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Doit rester identique à SUBJECTS dans src/lib/siteFooter.js.
const SUBJECTS = [
  "Question générale",
  "Support technique",
  "Abonnement et facturation",
  "Devenir station partenaire",
  "Protection des données (CDP · RGPD)",
  "Signaler un problème",
  "Autre",
];

const MAX_PER_HOUR = 5;
const MIN_FILL_MS = 2500;
const RETENTION_MONTHS = 12;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Requête invalide." }, 400);

    // Robot : champ piège rempli ou formulaire envoyé trop vite. On répond
    // "ok" sans rien enregistrer pour ne pas lui donner d'indice.
    if (String(body.company_website ?? "").trim() !== "") return json({ ok: true });
    if (Number(body.elapsedMs) < MIN_FILL_MS) return json({ ok: true });

    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const subject = String(body.subject ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (name.length < 2 || name.length > 100) return json({ error: "Merci de renseigner votre nom." }, 400);
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Merci de renseigner une adresse email valide." }, 400);
    }
    if (!SUBJECTS.includes(subject)) return json({ error: "Merci de choisir un sujet." }, 400);
    if (message.length < 10 || message.length > 2000) {
      return json({ error: "Votre message doit faire entre 10 et 2000 caractères." }, 400);
    }

    // Limite de débit par IP (hashée avec un sel propre au projet).
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "inconnue";
    const ipHash = await sha256Hex(`${ip}|${Deno.env.get("SUPABASE_URL")}`);
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", since);
    if ((count ?? 0) >= MAX_PER_HOUR) {
      return json({ error: "Trop de messages envoyés récemment. Réessayez dans une heure ou écrivez-nous par email." }, 429);
    }

    const { data: row, error: insertError } = await supabase
      .from("contact_messages")
      .insert({ name, email, subject, message, ip_hash: ipHash })
      .select("id")
      .single();
    if (insertError || !row) {
      console.error("contact_messages insert failed", insertError);
      return json({ error: "Impossible d'enregistrer votre message pour le moment." }, 500);
    }

    // Purge de conservation (ne bloque jamais l'envoi).
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - RETENTION_MONTHS);
    await supabase.from("contact_messages").delete().lt("created_at", cutoff.toISOString());

    // Notification à l'équipe. Si Resend échoue, le message reste enregistré
    // (notified_at vide) : on répond quand même "ok" au visiteur.
    const html = `
      <div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111;">
        <h1 style="font-size:18px;margin:0 0 12px;">Nouveau message — ${escapeHtml(subject)}</h1>
        <p style="font-size:14px;margin:0 0 4px;"><strong>De :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>
        <p style="font-size:14px;margin:0 0 16px;color:#666;">Répondez directement à cet email pour écrire au visiteur.</p>
        <div style="font-size:15px;line-height:1.6;white-space:pre-wrap;border-left:3px solid #10b981;padding-left:12px;">${escapeHtml(message)}</div>
      </div>`;
    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: RESEND_FROM,
          to: CONTACT_TO_EMAIL,
          reply_to: email,
          subject: `[Contact] ${subject} — ${name}`.slice(0, 200),
          html,
        }),
      });
      if (resendRes.ok) {
        await supabase.from("contact_messages").update({ notified_at: new Date().toISOString() }).eq("id", row.id);
      } else {
        console.error("Resend error", resendRes.status, await resendRes.text());
      }
    } catch (mailError) {
      console.error("Resend fetch failed", mailError);
    }

    return json({ ok: true });
  } catch (err) {
    console.error("send-contact-message", err);
    return json({ error: "Une erreur est survenue. Réessayez plus tard." }, 500);
  }
});
