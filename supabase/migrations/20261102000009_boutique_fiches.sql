-- Fiches de produits en attente de fabrication (écrites par le propriétaire ou à la main) : la fabrique GitHub les lit avec
-- son jeton OIDC, construit et vérifie chaque classeur, puis le dépose. Une fiche « immediate » est publiée dès le dépôt.
create table tcv.boutique_fiches (
  id bigint generated always as identity primary key,
  fiche jsonb not null check (jsonb_typeof(fiche) = 'object'),
  publication text not null default 'differee' check (publication in ('immediate', 'differee')),
  statut text not null default 'en_attente' check (statut in ('en_attente', 'faite')),
  produit text,
  cree_le timestamptz not null default now(),
  faite_le timestamptz
);
alter table tcv.boutique_fiches enable row level security;

create or replace function public.boutique_fiches_attente() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'fiche', f.fiche) order by f.id), '[]'::jsonb)
  from tcv.boutique_fiches f where f.statut = 'en_attente'
$$;

create or replace function public.boutique_fiche_deposee(p_fiche_id bigint, p_produit text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pub text;
begin
  update tcv.boutique_fiches set statut = 'faite', produit = p_produit, faite_le = p_now
  where id = p_fiche_id and statut = 'en_attente' returning publication into v_pub;
  if v_pub is null then return jsonb_build_object('ok', false); end if;
  if v_pub = 'immediate' then
    update tcv.boutique_produits set statut = 'publie', publie_le = p_now, source = 'manuel', decide_le = p_now
    where id = p_produit and statut = 'brouillon';
  end if;
  return jsonb_build_object('ok', true, 'publication', v_pub);
end;
$$;

revoke all on function public.boutique_fiches_attente() from public, anon, authenticated;
revoke all on function public.boutique_fiche_deposee(bigint, text, timestamptz) from public, anon, authenticated;
grant execute on function public.boutique_fiches_attente() to service_role;
grant execute on function public.boutique_fiche_deposee(bigint, text, timestamptz) to service_role;
