// Acceptation d'une invitation d'équipe. POST uniquement (appelée via
// supabase.functions.invoke depuis accept-invitation.html, page statique).
//
//   { action: 'lookup', token }            -> contexte de l'invitation
//        (qui invite, pour quel rôle) afin de l'afficher sur la page.
//   { action: 'accept', token, password, fullName }
//        -> crée le compte auth (mot de passe choisi), le profil role='staff'
//           rattaché à la station, active la ligne station_members.
//
// Aucun secret spécifique : SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY injectés.

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

async function loadInvite(token: string) {
  const { data: inv } = await admin
    .from("station_invitations")
    .select("id, member_id, station_id, email, status, expires_at")
    .eq("token", token).maybeSingle();
  if (!inv) return { error: "Invitation introuvable ou déjà utilisée." };
  if (inv.status === "accepted") return { error: "Cette invitation a déjà été acceptée. Connectez-vous." };
  if (inv.status !== "pending") return { error: "Cette invitation n'est plus valide." };
  if (new Date(inv.expires_at).getTime() < Date.now()) {
    await admin.from("station_invitations").update({ status: "expired" }).eq("id", inv.id);
    return { error: "Cette invitation a expiré. Demandez-en une nouvelle." };
  }
  const [{ data: member }, { data: station }] = await Promise.all([
    admin.from("station_members").select("id, full_name, role_id").eq("id", inv.member_id).single(),
    admin.from("stations").select("name").eq("id", inv.station_id).single(),
  ]);
  const { data: role } = member
    ? await admin.from("station_roles").select("name").eq("id", member.role_id).single()
    : { data: null };
  return { inv, member, stationName: station?.name || "la station", roleName: role?.name || "collaborateur" };
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
      const res = await loadInvite(token);
      if ("error" in res) return json({ valid: false, error: res.error });
      return json({
        valid: true,
        email: res.inv.email,
        fullName: res.member?.full_name || "",
        stationName: res.stationName,
        roleName: res.roleName,
      });
    }

    if (action === "accept") {
      const password = String(body?.password || "");
      if (password.length < 8) return json({ error: "Le mot de passe doit faire au moins 8 caractères." }, 400);

      const res = await loadInvite(token);
      if ("error" in res) return json({ error: res.error }, 400);
      const { inv, member } = res;
      const fullName = String(body?.fullName || member?.full_name || "").trim();

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: inv.email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createErr || !created?.user) {
        const msg = (createErr?.message || "").toLowerCase();
        if (msg.includes("registered") || msg.includes("already") || msg.includes("exists")) {
          return json({ error: "Un compte existe déjà avec cet email. Contactez la station." }, 409);
        }
        return json({ error: "Création du compte impossible.", detail: createErr?.message }, 500);
      }
      const uid = created.user.id;

      const { error: profErr } = await admin.from("profiles").insert({
        id: uid, role: "staff", station_id: inv.station_id, full_name: fullName, email: inv.email,
      });
      if (profErr) {
        await admin.auth.admin.deleteUser(uid).catch(() => {});
        return json({ error: "Rattachement du profil impossible.", detail: profErr.message }, 500);
      }

      await admin.from("station_members")
        .update({ profile_id: uid, status: "active", full_name: fullName })
        .eq("id", inv.member_id);
      await admin.from("station_invitations").update({ status: "accepted" }).eq("id", inv.id);

      return json({ ok: true });
    }

    return json({ error: "Action inconnue." }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
