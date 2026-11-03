-- Services qui livrent des IMAGES (affiches, retouches) et photos envoyées par les clients.
-- Appliqué en base en trois temps (boutique_sortie_image, boutique_deposer_generateur_sortie, boutique_photos_client) ;
-- ce fichier en rassemble l'état final.
alter table tcv.boutique_produits add column if not exists sortie text not null default 'document' check (sortie in ('document', 'image'));
-- tcv.boutique_json : ajoute 'sortie' ; boutique_commande : produit.sortie ; boutique_generation_reserver : renvoie 'sortie' ;
-- boutique_deposer_generateur : accepte p_produit.sortie ('document' | 'image').
-- (Définitions complètes : voir la base, fonctions du même nom ; elles reprennent celles de 20261102000010 et 20261102000012.)

create or replace function public.boutique_commande_image_ajouter(p_order_id text, p_nom text, p_mime text, p_b64 text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_bytes bytea;
begin
  if p_nom !~ '^[a-z0-9-]{1,40}\.(png|jpg|jpeg|webp)$' or p_mime not in ('image/png', 'image/jpeg', 'image/webp') then return false; end if;
  if not exists (select 1 from tcv.orders where id = p_order_id and product like 'bt\_%' and status = 'paid' and purged_at is null) then return false; end if;
  v_bytes := decode(p_b64, 'base64');
  if length(v_bytes) = 0 or length(v_bytes) > 6000000 then return false; end if;
  insert into tcv.course_assets (name, mime, bytes, sha256, updated_at)
  values ('bt-cmd/' || p_order_id || '/' || p_nom, p_mime, v_bytes, encode(extensions.digest(v_bytes, 'sha256'), 'hex'), now())
  on conflict (name) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at;
  return true;
end;
$$;

create or replace function public.boutique_commande_image(p_order_id text, p_token_hash text, p_nom text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_a tcv.course_assets;
begin
  if p_nom !~ '^[a-z0-9-]{1,40}\.(png|jpg|jpeg|webp)$' then return null; end if;
  if not exists (select 1 from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%'
                 and status = 'paid' and purged_at is null) then return null; end if;
  if not public.tcv_hit_rate_limit('bt-img:' || p_order_id, 86400, 60, p_now) then return jsonb_build_object('erreur', 'trop'); end if;
  select * into v_a from tcv.course_assets where name = 'bt-cmd/' || p_order_id || '/' || p_nom;
  if not found then return null; end if;
  return jsonb_build_object('nom', p_nom, 'mime', v_a.mime, 'b64', encode(v_a.bytes, 'base64'));
end;
$$;

create or replace function public.boutique_commande_source_ajouter(p_order_id text, p_nom text, p_mime text, p_b64 text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_bytes bytea;
begin
  if p_nom is null or p_nom !~ '^source-[1-6]\.(png|jpg|webp)$' or p_mime not in ('image/png', 'image/jpeg', 'image/webp') then return false; end if;
  if not exists (select 1 from tcv.orders where id = p_order_id and product like 'bt\_%' and status = 'checkout'
                 and created_at > now() - interval '15 minutes') then return false; end if;
  v_bytes := decode(p_b64, 'base64');
  if length(v_bytes) < 1000 or length(v_bytes) > 3500000 then return false; end if;
  insert into tcv.course_assets (name, mime, bytes, sha256, updated_at)
  values ('bt-cmd/' || p_order_id || '/' || p_nom, p_mime, v_bytes, encode(extensions.digest(v_bytes, 'sha256'), 'hex'), now())
  on conflict (name) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at;
  return true;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['boutique_commande_image_ajouter(text, text, text, text)', 'boutique_commande_image(text, text, text, timestamptz)',
    'boutique_commande_source_ajouter(text, text, text, text)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- Images et photos des commandes : effacées 3 jours après une commande non payée, 31 jours sinon (chaque heure)
select cron.schedule('boutique-images-purge', '17 * * * *', $$
  delete from tcv.course_assets a where a.name like 'bt-cmd/%' and (a.updated_at < now() - interval '31 days'
    or (a.updated_at < now() - interval '3 days' and not exists (
      select 1 from tcv.orders o where o.status = 'paid' and a.name like 'bt-cmd/' || o.id || '/%')))
$$);
