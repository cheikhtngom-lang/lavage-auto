-- Numéro WhatsApp du client sur une vente sur place de la boutique, pour que
-- le reçu s'ouvre directement sur sa discussion WhatsApp, depuis n'importe
-- quel appareil de la station (voir src/lib/shopReceipt.js).
--
-- shop_record_sale reste inchangée : le numéro est posé juste après la vente
-- (ou plus tard depuis la fenêtre du reçu) par shop_set_sale_phone, réservée
-- à la station propriétaire de la vente. Ré-exécutable sans risque.

alter table public.shop_sales add column if not exists client_phone text;
alter table public.shop_sales drop constraint if exists shop_sales_client_phone_ck;
alter table public.shop_sales add constraint shop_sales_client_phone_ck
  check (client_phone is null or char_length(client_phone) <= 30);

create or replace function public.shop_set_sale_phone(p_sale_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.shop_sales
     set client_phone = nullif(left(trim(coalesce(p_phone, '')), 30), '')
   where id = p_sale_id and station_id = public.current_station_id();
  if not found then
    raise exception 'Vente introuvable.';
  end if;
end;
$$;
revoke all on function public.shop_set_sale_phone(uuid, text) from public, anon;
grant execute on function public.shop_set_sale_phone(uuid, text) to authenticated;

notify pgrst, 'reload schema';
