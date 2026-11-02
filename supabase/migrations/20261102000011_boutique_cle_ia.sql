-- Rédaction des documents sur mesure : clé OpenRouter du propriétaire, enregistrée une fois depuis son application
-- (route /admin/ia de la fonction « boutique », protégée par ADMIN_KEY). Jamais renvoyée au navigateur.
create or replace function public.boutique_reglages() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin_key', (select value from tcv.settings where key = 'ADMIN_KEY'),
    'wave', (select value from tcv.settings where key = 'MANUAL_WAVE_NUMBER'),
    'openrouter', (select value from tcv.settings where key = 'BOUTIQUE_OPENROUTER_KEY'))
$$;

create or replace function public.boutique_definir_cle_ia(p_cle text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_cle is null or p_cle !~ '^sk-or-[A-Za-z0-9_-]{20,200}$' then return false; end if;
  insert into tcv.settings (key, value, updated_at) values ('BOUTIQUE_OPENROUTER_KEY', p_cle, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;
  return true;
end;
$$;

revoke all on function public.boutique_reglages() from public, anon, authenticated;
revoke all on function public.boutique_definir_cle_ia(text) from public, anon, authenticated;
grant execute on function public.boutique_reglages() to service_role;
grant execute on function public.boutique_definir_cle_ia(text) to service_role;
