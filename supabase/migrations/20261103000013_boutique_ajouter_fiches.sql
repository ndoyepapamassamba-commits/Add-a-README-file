-- Fiches écrites à l'avance, ajoutées en lot par le propriétaire (jamais publiées dans le dépôt : contenu payant).
-- La fabrique les construit, les vérifie et les dépose à son prochain passage ; publication 24 h plus tard (5 par jour).
create or replace function public.boutique_ajouter_fiches(p_fiches jsonb, p_publication text default 'differee') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_ids jsonb := '[]'::jsonb;
  v_f jsonb;
  v_id bigint;
begin
  if jsonb_typeof(p_fiches) <> 'array' or jsonb_array_length(p_fiches) not between 1 and 40 then
    return jsonb_build_object('erreur', 'fiches');
  end if;
  if p_publication not in ('immediate', 'differee') then return jsonb_build_object('erreur', 'publication'); end if;
  for v_f in select value from jsonb_array_elements(p_fiches) loop
    if jsonb_typeof(v_f) <> 'object' or coalesce(v_f ->> 'titre', '') = '' then continue; end if;
    if exists (select 1 from tcv.boutique_fiches where fiche ->> 'titre' = v_f ->> 'titre') then continue; end if;
    insert into tcv.boutique_fiches (fiche, publication) values (v_f, p_publication) returning id into v_id;
    v_ids := v_ids || to_jsonb(v_id);
  end loop;
  return jsonb_build_object('ajoutees', v_ids);
end;
$$;
revoke all on function public.boutique_ajouter_fiches(jsonb, text) from public, anon, authenticated;
grant execute on function public.boutique_ajouter_fiches(jsonb, text) to service_role;
