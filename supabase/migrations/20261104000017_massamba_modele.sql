-- MASSAMBA : petit modèle de l'application privée MASSAMBA INTELLIGENCE, réentraîné par GitHub Actions
-- (dépôt privé ndoyepapamassamba-commits/massamba-modele). Fonction Edge « massamba », contrat API-MASSAMBA.md v1.1 :
--   - exemples d'entraînement validés par le propriétaire (format conversation, sans données personnelles), dédoublonnés
--     par l'empreinte SHA-256 des messages normalisés ; identifiants exposés en chaînes triables (12 chiffres) ;
--   - séances (« versions ») : AAAAMMJJ-HHMMSS attribué par le serveur ; statut candidat → publiee, ou rejetee,
--     rien_a_faire, echec ; durée comptée dans le budget mensuel quel que soit le statut ; fichiers dans le bucket PRIVÉ
--     « massamba » (<version>/<fichier>), 50 Mo par fichier, ~900 Mo au plus (plan gratuit : 1 Go).
-- Accès : clé de service seulement (RLS active, aucune politique ; fonctions réservées à service_role). La clé du propriétaire
-- n'est jamais lue par la fonction Edge : elle envoie l'empreinte de la clé reçue, comparée ici à celle de ADMIN_KEY.
-- Appliqué en quatre temps (« massamba_modele », « massamba_modele_complements », « massamba_modele_contrat_v1_1 »,
-- « massamba_modele_retrait ») ;
-- ce fichier est l'état final.

create table if not exists tcv.massamba_exemples (
  id bigserial primary key,
  empreinte text not null unique check (empreinte ~ '^[0-9a-f]{64}$'),
  donnees jsonb not null,
  domaine text not null default 'general' check (domaine ~ '^[a-z0-9_-]{1,40}$'),
  ajoute_le timestamptz not null default now()
);

-- Une ligne par séance d'entraînement consignée (POST /versions), quel que soit son statut
create table if not exists tcv.massamba_versions (
  version text primary key check (version ~ '^[0-9]{8}-[0-9]{6}(-[0-9]{1,3})?$'),
  statut text not null check (statut in ('candidat', 'publiee', 'rejetee', 'rien_a_faire', 'echec')),
  base text not null default '',
  revision text,
  scores jsonb not null default '{}'::jsonb,
  nb_exemples integer not null default 0,
  reste integer not null default 0,
  dernier_id bigint not null default 0,
  duree_minutes numeric(10, 2) not null default 0 check (duree_minutes >= 0),
  chemins jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  cree_le timestamptz not null default now(),
  publiee_le timestamptz
);
create index if not exists massamba_versions_cree_le on tcv.massamba_versions (cree_le);

alter table tcv.massamba_exemples enable row level security;
alter table tcv.massamba_versions enable row level security;
revoke all on table tcv.massamba_exemples from public, anon, authenticated;
revoke all on table tcv.massamba_versions from public, anon, authenticated;
revoke all on sequence tcv.massamba_exemples_id_seq from public, anon, authenticated;

-- Bucket privé des fichiers du modèle (adaptateur, GGUF, parties du modèle fusionné), 50 Mo par fichier
insert into storage.buckets (id, name, public, file_size_limit)
values ('massamba', 'massamba', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

-- Clé du propriétaire : comparaison des empreintes SHA-256 (la clé elle-même ne sort jamais de la base)
create or replace function public.massamba_cle_valide(p_empreinte text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select length(s.value) >= 16 and encode(pg_catalog.sha256(convert_to(s.value, 'UTF8')), 'hex') = lower(coalesce(p_empreinte, ''))
    from tcv.settings s where s.key = 'ADMIN_KEY'
  ), false)
$$;

-- Dépôt GitHub figé au premier appel (repository_id, repository_owner_id) : un dépôt supprimé puis recréé sous le même
-- nom est refusé
create or replace function public.massamba_figer_depot(p_repo_id text, p_owner_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_repo text;
  v_owner text;
begin
  if coalesce(p_repo_id, '') !~ '^[0-9]{1,20}$' or coalesce(p_owner_id, '') !~ '^[0-9]{1,20}$' then return false; end if;
  select value into v_repo from tcv.settings where key = 'MASSAMBA_REPOSITORY_ID';
  select value into v_owner from tcv.settings where key = 'MASSAMBA_REPOSITORY_OWNER_ID';
  if v_repo is null then
    insert into tcv.settings (key, value, updated_at) values ('MASSAMBA_REPOSITORY_ID', p_repo_id, now()) on conflict (key) do nothing;
    v_repo := p_repo_id;
  end if;
  if v_owner is null then
    insert into tcv.settings (key, value, updated_at) values ('MASSAMBA_REPOSITORY_OWNER_ID', p_owner_id, now()) on conflict (key) do nothing;
    v_owner := p_owner_id;
  end if;
  return v_repo = p_repo_id and v_owner = p_owner_id;
end;
$$;

-- Ajout d'exemples déjà validés et dédoublonnés par la fonction Edge : [{ empreinte, donnees, domaine }] dans l'ordre reçu.
-- Plafond de 50 000 exemples (taille de la base).
create or replace function public.massamba_ajouter(p_exemples jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_total integer := coalesce(jsonb_array_length(p_exemples), 0);
  v_n integer;
begin
  if v_total = 0 then return jsonb_build_object('ajoutes', 0, 'doublons', 0); end if;
  if (select count(*) from tcv.massamba_exemples) + v_total > 50000 then return jsonb_build_object('erreur', 'plein'); end if;
  with ins as (
    insert into tcv.massamba_exemples (empreinte, donnees, domaine, ajoute_le)
    select e.v ->> 'empreinte', e.v -> 'donnees', coalesce(e.v ->> 'domaine', 'general'), p_now
    from jsonb_array_elements(p_exemples) with ordinality as e(v, n)
    order by e.n
    on conflict (empreinte) do nothing
    returning 1
  )
  select count(*) into v_n from ins;
  return jsonb_build_object('ajoutes', v_n, 'doublons', v_total - v_n);
end;
$$;

-- Exemples rejetés après coup par le propriétaire : retirés du corpus par leur référence locale (donnees.ref)
create or replace function public.massamba_retirer(p_refs text[]) returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from tcv.massamba_exemples where donnees ->> 'ref' = any(coalesce(p_refs, '{}'::text[])) returning 1)
  select count(*)::integer from d
$$;

-- Lecture par l'atelier : borne (dernier identifiant parmi les p_limite suivants) puis pages
create or replace function public.massamba_borne(p_depuis bigint, p_limite integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('jusqua', max(x.id), 'nb', count(*))
  from (select id from tcv.massamba_exemples where id > p_depuis order by id limit greatest(0, least(p_limite, 20000))) x
$$;

create or replace function public.massamba_exemples_page(p_depuis bigint, p_jusqua bigint, p_limite integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'domaine', x.domaine, 'donnees', x.donnees) order by x.id), '[]'::jsonb)
  from (select id, domaine, donnees from tcv.massamba_exemples where id > p_depuis and id <= p_jusqua order by id limit greatest(0, least(p_limite, 2000))) x
$$;

-- Vérification rapide de l'atelier (toutes les 3 h) : nouveaux exemples depuis un identifiant
drop function if exists public.massamba_compte(bigint);
create or replace function public.massamba_compte(p_depuis bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nouveaux', (select count(*) from tcv.massamba_exemples where id > coalesce(p_depuis, 0)),
    'dernier_id', (select coalesce(max(id), 0) from tcv.massamba_exemples),
    'derniere_publiee_le', (select v.publiee_le from tcv.massamba_versions v where v.statut = 'publiee' order by v.version desc limit 1)
  )
$$;

create or replace function public.massamba_etat() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nb_exemples', (select count(*) from tcv.massamba_exemples),
    'dernier_id', (select coalesce(max(id), 0) from tcv.massamba_exemples),
    'par_domaine', (select coalesce(jsonb_object_agg(d.domaine, d.n), '{}'::jsonb) from (select domaine, count(*) as n from tcv.massamba_exemples group by domaine) d),
    'versions', (select coalesce(jsonb_agg(to_jsonb(v) order by v.version desc), '[]'::jsonb) from (select * from tcv.massamba_versions order by version desc limit 10) v),
    'derniere_publiee', (select to_jsonb(v) from tcv.massamba_versions v where v.statut = 'publiee' order by v.version desc limit 1)
  )
$$;

-- Séance consignée : version AAAAMMJJ-HHMMSS (UTC) attribuée ici (suffixe -2, -3… si la seconde est déjà prise) ;
-- chemins <version>/<fichier> pour une candidate
drop function if exists public.massamba_version_creer(text, jsonb, integer, text[], jsonb, timestamptz);
drop function if exists public.massamba_version_creer(text, jsonb, integer, text[], jsonb, integer, timestamptz);
create or replace function public.massamba_version_creer(p_statut text, p_base text, p_revision text, p_scores jsonb, p_nb integer,
  p_reste integer, p_dernier_id bigint, p_duree numeric, p_fichiers text[], p_details jsonb, p_now timestamptz)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_base text := to_char(p_now at time zone 'UTC', 'YYYYMMDD-HH24MISS');
  v_version text := v_base;
  v_i integer := 1;
  v_chemins jsonb;
begin
  if p_statut not in ('candidat', 'rejetee', 'rien_a_faire', 'echec') then return jsonb_build_object('erreur', 'statut'); end if;
  perform pg_advisory_xact_lock(hashtext('tcv.massamba_versions'));
  while exists (select 1 from tcv.massamba_versions where version = v_version) loop
    v_i := v_i + 1;
    if v_i > 999 then return jsonb_build_object('erreur', 'version'); end if;
    v_version := v_base || '-' || v_i;
  end loop;
  select coalesce(jsonb_object_agg(f, v_version || '/' || f), '{}'::jsonb) into v_chemins from unnest(coalesce(p_fichiers, '{}'::text[])) as f;
  insert into tcv.massamba_versions (version, statut, base, revision, scores, nb_exemples, reste, dernier_id, duree_minutes, chemins, details, cree_le)
  values (v_version, p_statut, coalesce(p_base, ''), p_revision, coalesce(p_scores, '{}'::jsonb), greatest(0, coalesce(p_nb, 0)),
    greatest(0, coalesce(p_reste, 0)), greatest(0, coalesce(p_dernier_id, 0)), greatest(0, coalesce(p_duree, 0)), v_chemins,
    coalesce(p_details, '{}'::jsonb), p_now);
  return jsonb_build_object('version', v_version, 'chemins', v_chemins);
end;
$$;

drop function if exists public.massamba_version(integer);
create or replace function public.massamba_version(p_version text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(v) from tcv.massamba_versions v where v.version = p_version
$$;

create or replace function public.massamba_derniere() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(v) from tcv.massamba_versions v where v.statut = 'publiee' order by v.version desc limit 1
$$;

-- Dernière séance consignée, quel que soit son statut
create or replace function public.massamba_tentative() returns jsonb
language sql stable security definer set search_path = '' as $$
  select to_jsonb(v) from tcv.massamba_versions v order by v.version desc limit 1
$$;

-- candidat → publiee (idempotent : une version déjà publiée est renvoyée telle quelle) ; empreintes et tailles gardées
drop function if exists public.massamba_version_statut(integer, text, jsonb, text, timestamptz);
drop function if exists public.massamba_version_statut(integer, text, jsonb, text, integer, timestamptz);
create or replace function public.massamba_publier(p_version text, p_empreintes jsonb, p_tailles jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v tcv.massamba_versions;
begin
  select * into v from tcv.massamba_versions where version = p_version for update;
  if not found then return null; end if;
  if v.statut = 'publiee' then return to_jsonb(v); end if;
  if v.statut <> 'candidat' then return jsonb_build_object('erreur', 'statut', 'statut', v.statut); end if;
  update tcv.massamba_versions set statut = 'publiee', publiee_le = p_now,
    details = details || jsonb_build_object('empreintes', coalesce(p_empreintes, '{}'::jsonb), 'tailles', coalesce(p_tailles, '{}'::jsonb))
  where version = p_version
  returning * into v;
  return to_jsonb(v);
end;
$$;

-- candidat → rejetee (porte de régression du serveur)
create or replace function public.massamba_rejeter(p_version text, p_raison text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v tcv.massamba_versions;
begin
  update tcv.massamba_versions set statut = 'rejetee', details = details || jsonb_build_object('raisons', jsonb_build_array(left(coalesce(p_raison, ''), 300)))
  where version = p_version and statut = 'candidat'
  returning * into v;
  return case when v.version is null then null else to_jsonb(v) end;
end;
$$;

-- Budget de minutes de GitHub Actions : somme des durées des séances consignées dans [p_debut, p_fin), tout statut
drop function if exists public.massamba_budget(timestamptz, timestamptz);
create or replace function public.massamba_budget(p_debut timestamptz, p_fin timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('minutes', coalesce(sum(v.duree_minutes), 0), 'seances', count(*))
  from tcv.massamba_versions v where v.cree_le >= p_debut and v.cree_le < p_fin
$$;

-- Place occupée dans le bucket « massamba »
create or replace function public.massamba_stockage() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('octets', coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0), 'objets', count(*))
  from storage.objects o where o.bucket_id = 'massamba'
$$;

-- Les p_n dernières versions publiées (la plus récente d'abord)
drop function if exists public.massamba_publiees(integer);
create or replace function public.massamba_publiees(p_n integer) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x.version order by x.version desc), '[]'::jsonb)
  from (select version from tcv.massamba_versions where statut = 'publiee' order by version desc limit greatest(0, least(p_n, 20))) x
$$;

-- Ménage : versions antérieures à p_avant (ordre des chaînes), hors p_garder, qui ont encore des fichiers
drop function if exists public.massamba_a_purger(integer, integer[]);
create or replace function public.massamba_a_purger(p_avant text, p_garder text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'chemins', v.chemins) order by v.version), '[]'::jsonb)
  from tcv.massamba_versions v
  where v.version < p_avant and not (v.version = any(coalesce(p_garder, '{}'::text[]))) and v.chemins <> '{}'::jsonb
$$;

drop function if exists public.massamba_purge_faite(integer[], timestamptz);
create or replace function public.massamba_purge_faite(p_versions text[], p_now timestamptz) returns integer
language sql security definer set search_path = '' as $$
  with u as (
    update tcv.massamba_versions
    set chemins = '{}'::jsonb, details = details || jsonb_build_object('fichiers_effaces_le', p_now)
    where version = any(p_versions)
    returning 1
  )
  select count(*)::integer from u
$$;

-- Retire quelques fichiers d'une version (modèle fusionné de la dernière publiée quand la place manque)
create or replace function public.massamba_chemins_retirer(p_version text, p_noms text[], p_now timestamptz) returns jsonb
language sql security definer set search_path = '' as $$
  update tcv.massamba_versions
  set chemins = chemins - p_noms,
      details = details || jsonb_build_object('fichiers_retires', coalesce(details -> 'fichiers_retires', '[]'::jsonb) || to_jsonb(p_noms), 'fichiers_retires_le', p_now)
  where version = p_version
  returning chemins
$$;

revoke all on function public.massamba_cle_valide(text) from public, anon, authenticated;
revoke all on function public.massamba_figer_depot(text, text) from public, anon, authenticated;
revoke all on function public.massamba_ajouter(jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.massamba_retirer(text[]) from public, anon, authenticated;
revoke all on function public.massamba_borne(bigint, integer) from public, anon, authenticated;
revoke all on function public.massamba_exemples_page(bigint, bigint, integer) from public, anon, authenticated;
revoke all on function public.massamba_compte(bigint) from public, anon, authenticated;
revoke all on function public.massamba_etat() from public, anon, authenticated;
revoke all on function public.massamba_version_creer(text, text, text, jsonb, integer, integer, bigint, numeric, text[], jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.massamba_version(text) from public, anon, authenticated;
revoke all on function public.massamba_derniere() from public, anon, authenticated;
revoke all on function public.massamba_tentative() from public, anon, authenticated;
revoke all on function public.massamba_publier(text, jsonb, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.massamba_rejeter(text, text) from public, anon, authenticated;
revoke all on function public.massamba_budget(timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.massamba_stockage() from public, anon, authenticated;
revoke all on function public.massamba_publiees(integer) from public, anon, authenticated;
revoke all on function public.massamba_a_purger(text, text[]) from public, anon, authenticated;
revoke all on function public.massamba_purge_faite(text[], timestamptz) from public, anon, authenticated;
revoke all on function public.massamba_chemins_retirer(text, text[], timestamptz) from public, anon, authenticated;

grant execute on function public.massamba_cle_valide(text) to service_role;
grant execute on function public.massamba_figer_depot(text, text) to service_role;
grant execute on function public.massamba_ajouter(jsonb, timestamptz) to service_role;
grant execute on function public.massamba_retirer(text[]) to service_role;
grant execute on function public.massamba_borne(bigint, integer) to service_role;
grant execute on function public.massamba_exemples_page(bigint, bigint, integer) to service_role;
grant execute on function public.massamba_compte(bigint) to service_role;
grant execute on function public.massamba_etat() to service_role;
grant execute on function public.massamba_version_creer(text, text, text, jsonb, integer, integer, bigint, numeric, text[], jsonb, timestamptz) to service_role;
grant execute on function public.massamba_version(text) to service_role;
grant execute on function public.massamba_derniere() to service_role;
grant execute on function public.massamba_tentative() to service_role;
grant execute on function public.massamba_publier(text, jsonb, jsonb, timestamptz) to service_role;
grant execute on function public.massamba_rejeter(text, text) to service_role;
grant execute on function public.massamba_budget(timestamptz, timestamptz) to service_role;
grant execute on function public.massamba_stockage() to service_role;
grant execute on function public.massamba_publiees(integer) to service_role;
grant execute on function public.massamba_a_purger(text, text[]) to service_role;
grant execute on function public.massamba_purge_faite(text[], timestamptz) to service_role;
grant execute on function public.massamba_chemins_retirer(text, text[], timestamptz) to service_role;
