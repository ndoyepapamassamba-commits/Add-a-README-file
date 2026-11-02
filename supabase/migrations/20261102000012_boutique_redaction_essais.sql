-- Rédaction des documents sur mesure : après un échec, les nouvelles tentatives sont espacées (30 s, 1 min, 2 min… 30 min
-- au plus) et s'arrêtent après 8 essais, pour qu'un modèle défaillant ne consomme jamais le crédit OpenRouter en boucle.
create or replace function public.boutique_generation_enregistrer(p_order_id text, p_document jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update tcv.orders
  set document = case when p_document ? 'sections' then p_document else p_document || jsonb_build_object('le', now()) end
  where id = p_order_id and product like 'bt\_%' and status = 'paid' and purged_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

create or replace function public.boutique_generation_reserver(p_order_id text, p_token_hash text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o tcv.orders;
  v_p tcv.boutique_produits;
  v_essais integer;
begin
  select * into v_o from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%'
    and status = 'paid' and purged_at is null for update;
  if not found then return null; end if;
  select * into v_p from tcv.boutique_produits where id = v_o.product;
  if v_p.type <> 'generateur' or v_o.document ? 'sections' then return null; end if;
  if v_o.document ? 'en_cours' and (v_o.document ->> 'en_cours')::timestamptz > p_now - interval '3 minutes' then
    return jsonb_build_object('occupe', true);
  end if;
  v_essais := coalesce((v_o.document ->> 'essais')::integer, 0);
  if v_essais >= 8 then return jsonb_build_object('occupe', true, 'abandon', true); end if;
  if v_essais > 0 and v_o.document ? 'le'
     and (v_o.document ->> 'le')::timestamptz > p_now - least(interval '30 seconds' * power(2, v_essais - 1), interval '30 minutes') then
    return jsonb_build_object('occupe', true);
  end if;
  update tcv.orders set document = jsonb_build_object('en_cours', p_now, 'essais', v_essais) where id = v_o.id;
  return jsonb_build_object('consigne', v_p.consigne, 'formulaire', v_p.formulaire, 'reponses', v_o.input,
    'titre', v_p.titre, 'essais', v_essais);
end;
$$;

revoke all on function public.boutique_generation_enregistrer(text, jsonb) from public, anon, authenticated;
revoke all on function public.boutique_generation_reserver(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.boutique_generation_enregistrer(text, jsonb) to service_role;
grant execute on function public.boutique_generation_reserver(text, text, timestamptz) to service_role;
