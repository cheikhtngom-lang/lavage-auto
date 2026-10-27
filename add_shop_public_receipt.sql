-- Reçu en ligne d'une vente sur place de la boutique : le client reçoit sur
-- WhatsApp un lien /recu.html?v=<id de la vente> qui affiche son reçu de
-- paiement (même mise en page que le reçu imprimé, voir src/recu.js).
--
-- Le lien porte l'identifiant aléatoire (uuid) de la vente : impossible à
-- deviner, il ne montre que CE reçu. Le téléphone du client et la note
-- interne ne sont pas renvoyés. Ré-exécutable sans risque.

create or replace function public.shop_public_receipt(p_sale_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'items', s.items,
    'amount', s.amount,
    'payment_method', s.payment_method,
    'status', s.status,
    'created_at', s.created_at,
    'client_name', t.client_name,
    'station', jsonb_build_object('name', st.name, 'phone', st.owner_phone, 'address', st.address, 'quartier', st.quartier)
  )
  from public.shop_sales s
  join public.stations st on st.id = s.station_id
  left join public.transactions t on t.id = s.transaction_id
  where s.id = p_sale_id;
$$;
revoke all on function public.shop_public_receipt(uuid) from public;
grant execute on function public.shop_public_receipt(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
