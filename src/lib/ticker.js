// Bandeau défilant de la page d'accueil (add_site_ticker.sql) — partagé par
// index.html (affichage) et Super Admin > Bandeau d'accueil (aperçu).
// Messages du Super Admin d'abord (ordre choisi), puis les publicités payées
// et actives des stations (station_ads). Le filtre actif / dates est refait
// ici : le Super Admin, lui, lit TOUTES les lignes (RLS), y compris masquées.
// `supabase` est passé en paramètre pour que index.html réutilise son client.
const isLive = (startsAt, endsAt, now) => (!startsAt || new Date(startsAt) <= now) && (!endsAt || new Date(endsAt) > now);

export async function loadTickerItems(supabase) {
  const now = new Date();
  const [{ data: messages }, { data: ads }] = await Promise.all([
    supabase.from('site_ticker_messages').select('id, message, link_url, active, starts_at, ends_at, sort_order, created_at, stations!station_id(name)')
      .eq('active', true).order('sort_order').order('created_at', { ascending: false }),
    supabase.from('station_ads').select('id, message, starts_at, expires_at, stations!station_id(name)')
      .eq('status', 'ACTIVE').order('created_at', { ascending: false }),
  ]);
  return [
    ...(messages || []).filter((m) => isLive(m.starts_at, m.ends_at, now)).map((m) => ({
      key: `m-${m.id}`, kind: 'message', label: m.stations?.name || '', text: m.message, href: m.link_url || null,
    })),
    ...(ads || []).filter((a) => a.message && isLive(a.starts_at, a.expires_at, now)).map((a) => ({
      key: `a-${a.id}`, kind: 'ad', label: a.stations?.name || '', text: a.message, href: null,
    })),
  ];
}
