// Activation du compte du NOUVEAU propriétaire d'une station cédée. POST
// uniquement, appelée depuis accept-transfer.html (page statique, sans session).
//
//   { action: 'lookup', token }  -> contexte de la cession (nom de la station,
//        acquéreur, email prévu) pour l'afficher sur la page.
//   { action: 'accept', token, password, fullName, email, phone? }
//        -> crée le compte auth (email + mot de passe choisis par l'acquéreur,
//           qui peut changer l'email proposé), le rattache à la station comme
//           propriétaire ('admin') et clôture la cession.
//
// Le lien n'est jamais stocké en clair : la base ne garde que son SHA-256.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injectés, aucun autre secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function loadTransfer(token: string) {
  const { data: tr } = await admin
    .from("station_transfer_requests")
    .select("id, station_id, station_name, acquirer_name, acquirer_email, status, expires_at")
    .eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!tr) return { error: "Lien introuvable ou déjà utilisé." };
  if (tr.status === "completed") return { error: "Cette station a déjà été activée. Connectez-vous." };
  if (tr.status !== "ceded") return { error: "Ce lien n'est plus valide." };
  if (!tr.expires_at || new Date(tr.expires_at).getTime() < Date.now()) {
    return { error: "Ce lien a expiré. Demandez à l'administration de vous en renvoyer un." };
  }
  return { tr };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const action = body?.action;
    const token = String(body?.token || "");
    if (!token) return json({ error: "Lien invalide." }, 400);

    if (action === "lookup") {
      const res = await loadTransfer(token);
      if ("error" in res) return json({ valid: false, error: res.error });
      return json({
        valid: true,
        stationName: res.tr.station_name,
        fullName: res.tr.acquirer_name,
        email: res.tr.acquirer_email,
      });
    }

    if (action === "accept") {
      const password = String(body?.password || "");
      if (password.length < 8) return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);
      const fullName = String(body?.fullName || "").trim();
      if (!fullName) return json({ error: "Votre nom est requis." }, 400);
      const email = String(body?.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) return json({ error: "Email invalide." }, 400);
      const phone = String(body?.phone || "").trim().slice(0, 30);

      const res = await loadTransfer(token);
      if ("error" in res) return json({ error: res.error }, 400);
      const { tr } = res;

      // L'acquéreur peut choisir un autre email que celui du lien : il ne doit
      // pas déjà servir sur la plateforme (createUser refuse un doublon).
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created?.user) {
        const msg = (createErr?.message || "").toLowerCase();
        if (msg.includes("registered") || msg.includes("already") || msg.includes("exists")) {
          return json({ error: "Cet email est déjà utilisé sur la plateforme. Choisissez-en un autre." }, 409);
        }
        console.error("accept-station-transfer createUser:", createErr);
        return json({ error: "Création du compte impossible." }, 500);
      }
      const uid = created.user.id;

      const { error: rpcErr } = await admin.rpc("complete_station_transfer", {
        p_request_id: tr.id, p_acquirer_id: uid, p_full_name: fullName, p_email: email, p_phone: phone,
      });
      if (rpcErr) {
        // Rien ne doit rester à moitié : on retire le compte tout juste créé.
        await admin.auth.admin.deleteUser(uid).catch(() => {});
        console.error("accept-station-transfer complete:", rpcErr);
        return json({ error: "Activation impossible : " + rpcErr.message }, 500);
      }

      return json({ ok: true, email });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (err) {
    console.error("accept-station-transfer:", err);
    return json({ error: "Une erreur est survenue. Réessayez plus tard." }, 500);
  }
});
