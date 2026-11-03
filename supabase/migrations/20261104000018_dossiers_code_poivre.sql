-- ColisPreuve : poivre secret pour l'empreinte du code de remise (appliqué en base sous le nom « dossiers_code_poivre »).
-- La fonction « dossiers » calcule HMAC-SHA256(poivre, id + ":" + code) pour les nouveaux colis (donnees.code_schema = 2) ;
-- les anciens colis gardent sha256("code:" + code), seulement vérifié. Le poivre (32 octets tirés au hasard) est créé une
-- seule fois en base, jamais écrit dans le dépôt ni renvoyé par l'API ; seul le rôle service (la fonction) peut le lire.
insert into tcv.settings (key, value, updated_at)
select 'DOSSIERS_POIVRE', encode(extensions.gen_random_bytes(32), 'hex'), now()
where not exists (select 1 from tcv.settings where key = 'DOSSIERS_POIVRE');

create or replace function public.dossier_poivre() returns text
language sql stable security definer set search_path = '' as $$ select value from tcv.settings where key = 'DOSSIERS_POIVRE' $$;
revoke all on function public.dossier_poivre() from public, anon, authenticated;
grant execute on function public.dossier_poivre() to service_role;

notify pgrst, 'reload schema';
