-- Teranga Outils (boutique) : produits numériques fabriqués chaque jour par la fabrique (GitHub Actions), publiés
-- automatiquement 24 h après leur dépôt (sauf refus du propriétaire), vendus par Wave (montant unique, détecté par le
-- téléphone du propriétaire comme pour les CV) et livrés automatiquement. Fonction Edge : supabase/functions/boutique.
-- Les commandes vivent dans tcv.orders (produit « bt_<id> ») : la détection des paiements, le déblocage manuel, la purge
-- et les statistiques existantes s'appliquent telles quelles. Les fichiers vivent dans tcv.course_assets sous « bt/<id>/ ».

alter table tcv.orders drop constraint orders_product_check;
alter table tcv.orders add constraint orders_product_check check (
  product = any (array['cv', 'lettre', 'pack', 'stage', 'premium', 'pq_essentiel', 'pq_complet', 'imf_kit'])
  or product ~ '^bt_[a-z0-9_]{2,60}$'
);

create table tcv.boutique_produits (
  id text primary key check (id ~ '^bt_[a-z0-9_]{2,60}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  titre text not null check (length(titre) between 10 and 100),
  domaine text not null check (length(domaine) between 3 and 40),
  accroche text not null check (length(accroche) between 20 and 220),
  description text not null check (length(description) between 100 and 3000),
  points jsonb not null default '[]'::jsonb check (jsonb_typeof(points) = 'array'),
  faq jsonb not null default '[]'::jsonb check (jsonb_typeof(faq) = 'array'),
  prix integer not null check (prix between 500 and 9500),
  fichiers jsonb not null default '[]'::jsonb check (jsonb_typeof(fichiers) = 'array'),
  apercu jsonb,
  statut text not null default 'brouillon' check (statut in ('brouillon', 'publie', 'refuse', 'retire')),
  source text not null default 'fabrique' check (source in ('fabrique', 'manuel')),
  controle jsonb,
  cree_le timestamptz not null default now(),
  publier_apres timestamptz not null default now() + interval '24 hours',
  publie_le timestamptz,
  decide_le timestamptz
);
alter table tcv.boutique_produits enable row level security;
create index boutique_produits_statut on tcv.boutique_produits (statut, publier_apres);

-- Vue publique d'un produit (jamais le contenu des fichiers)
create or replace function tcv.boutique_json(p tcv.boutique_produits) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'titre', p.titre, 'domaine', p.domaine, 'accroche', p.accroche,
    'description', p.description, 'points', p.points, 'faq', p.faq, 'prix', p.prix,
    'fichiers', coalesce((select jsonb_agg(jsonb_build_object('nom', f ->> 'nom', 'taille', (f ->> 'taille')::integer))
                          from jsonb_array_elements(p.fichiers) f), '[]'::jsonb),
    'apercu', p.apercu, 'publie_le', p.publie_le)
$$;

create or replace function public.boutique_catalogue() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(tcv.boutique_json(p) order by p.publie_le desc, p.id), '[]'::jsonb)
  from tcv.boutique_produits p where p.statut = 'publie'
$$;

create or replace function public.boutique_produit(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select tcv.boutique_json(p) from tcv.boutique_produits p where p.id = p_id and p.statut = 'publie'
$$;

-- Commande : ligne dans tcv.orders + montant unique (mêmes règles que les CV : 49 montants sous le prix, réservés 72 h)
create or replace function public.boutique_creer_commande(p_produit text, p_order_id text, p_token_hash text,
  p_buyer jsonb, p_ip_hash text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p tcv.boutique_produits;
  v_amount integer;
begin
  select * into v_p from tcv.boutique_produits where id = p_produit and statut = 'publie';
  if not found then return jsonb_build_object('erreur', 'indisponible'); end if;
  if not public.tcv_hit_rate_limit('bt-order:' || coalesce(p_ip_hash, '-'), 3600, 10, p_now)
     or not public.tcv_hit_rate_limit('bt-order-global', 86400, 1000, p_now) then
    return jsonb_build_object('erreur', 'trop');
  end if;
  insert into tcv.orders (id, access_token_hash, product, template, amount, currency, status, buyer, ip_hash, created_at)
  values (p_order_id, p_token_hash, v_p.id, 'classique', v_p.prix, 'XOF', 'checkout', p_buyer, p_ip_hash, p_now);
  v_amount := public.tcv_hold_manual_amount(p_order_id, v_p.prix, 49, p_now, p_now - interval '72 hours', p_now - interval '48 hours');
  return jsonb_build_object('id', p_order_id, 'montant', coalesce(v_amount, v_p.prix), 'unique', v_amount is not null,
    'prix', v_p.prix, 'titre', v_p.titre);
end;
$$;

-- État d'une commande (jeton du client) ; une commande non payée garde son montant unique tant qu'on la consulte
create or replace function public.boutique_commande(p_order_id text, p_token_hash text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o tcv.orders;
  v_p tcv.boutique_produits;
  v_amount integer;
begin
  select * into v_o from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%';
  if not found then return null; end if;
  select * into v_p from tcv.boutique_produits where id = v_o.product;
  if v_o.status <> 'paid' and v_o.purged_at is null then
    v_amount := public.tcv_hold_manual_amount(v_o.id, v_o.amount, 49, p_now, p_now - interval '72 hours', p_now - interval '48 hours');
  end if;
  return jsonb_build_object(
    'id', v_o.id, 'payee', v_o.status = 'paid', 'purgee', v_o.purged_at is not null,
    'montant', coalesce(v_amount, v_o.manual_amount, v_o.amount), 'prix', v_o.amount,
    'produit', jsonb_build_object('id', v_p.id, 'titre', v_p.titre, 'slug', v_p.slug),
    'payee_le', v_o.paid_at, 'telechargeable_jusqu_au', v_o.paid_at + interval '30 days',
    'fichiers', case when v_o.status = 'paid' and v_o.purged_at is null then
      coalesce((select jsonb_agg(jsonb_build_object('nom', f ->> 'nom', 'taille', (f ->> 'taille')::integer))
                from jsonb_array_elements(v_p.fichiers) f), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- Fichier d'une commande payée (30 téléchargements par commande et par 24 h)
create or replace function public.boutique_fichier(p_order_id text, p_token_hash text, p_nom text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o tcv.orders;
  v_p tcv.boutique_produits;
  v_mime text;
  v_bytes bytea;
begin
  select * into v_o from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%'
    and status = 'paid' and purged_at is null;
  if not found then return null; end if;
  select * into v_p from tcv.boutique_produits where id = v_o.product;
  if not exists (select 1 from jsonb_array_elements(v_p.fichiers) f where f ->> 'nom' = p_nom) then return null; end if;
  if not public.tcv_hit_rate_limit('bt-dl:' || v_o.id, 86400, 30, p_now) then return jsonb_build_object('erreur', 'trop'); end if;
  select a.mime, a.bytes into v_mime, v_bytes from tcv.course_assets a where a.name = 'bt/' || v_p.id || '/' || p_nom;
  if v_bytes is null then return null; end if;
  return jsonb_build_object('nom', p_nom, 'mime', v_mime, 'b64', encode(v_bytes, 'base64'));
end;
$$;

-- Dépôt d'un produit par la fabrique (appel authentifié par la fonction Edge) : brouillon publié 24 h plus tard
create or replace function public.boutique_deposer(p_produit jsonb, p_fichiers jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := p_produit ->> 'slug';
  v_id text := 'bt_' || left(replace(coalesce(p_produit ->> 'slug', ''), '-', '_'), 60);
  v_statut text;
  v_f jsonb;
  v_bytes bytea;
  v_liste jsonb := '[]'::jsonb;
  v_total integer := 0;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('erreur', 'slug'); end if;
  if (select count(*) from tcv.boutique_produits where cree_le > p_now - interval '24 hours') >= 30 then
    return jsonb_build_object('erreur', 'quota');
  end if;
  select statut into v_statut from tcv.boutique_produits where id = v_id or slug = v_slug limit 1;
  if v_statut is not null and v_statut <> 'brouillon' then return jsonb_build_object('erreur', 'existe'); end if;
  if jsonb_typeof(p_fichiers) <> 'array' or jsonb_array_length(p_fichiers) not between 1 and 5 then
    return jsonb_build_object('erreur', 'fichiers');
  end if;
  for v_f in select * from jsonb_array_elements(p_fichiers) loop
    if coalesce(v_f ->> 'nom', '') !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$' or position('..' in v_f ->> 'nom') > 0 then
      return jsonb_build_object('erreur', 'nom de fichier');
    end if;
    v_bytes := decode(v_f ->> 'b64', 'base64');
    v_total := v_total + length(v_bytes);
    if length(v_bytes) = 0 or v_total > 4000000 then return jsonb_build_object('erreur', 'taille'); end if;
    insert into tcv.course_assets (name, mime, bytes, sha256, updated_at)
    values ('bt/' || v_id || '/' || (v_f ->> 'nom'), coalesce(v_f ->> 'mime', 'application/octet-stream'), v_bytes,
            encode(extensions.digest(v_bytes, 'sha256'), 'hex'), p_now)
    on conflict (name) do update set mime = excluded.mime, bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at;
    v_liste := v_liste || jsonb_build_object('nom', v_f ->> 'nom', 'mime', coalesce(v_f ->> 'mime', 'application/octet-stream'),
      'taille', length(v_bytes), 'sha256', encode(extensions.digest(v_bytes, 'sha256'), 'hex'));
  end loop;
  insert into tcv.boutique_produits (id, slug, titre, domaine, accroche, description, points, faq, prix, fichiers, apercu,
    statut, source, controle, cree_le, publier_apres)
  values (v_id, v_slug, p_produit ->> 'titre', p_produit ->> 'domaine', p_produit ->> 'accroche', p_produit ->> 'description',
    coalesce(p_produit -> 'points', '[]'::jsonb), coalesce(p_produit -> 'faq', '[]'::jsonb), (p_produit ->> 'prix')::integer,
    v_liste, p_produit -> 'apercu', 'brouillon', coalesce(p_produit ->> 'source', 'fabrique'), p_produit -> 'controle',
    p_now, p_now + interval '24 hours')
  on conflict (id) do update set slug = excluded.slug, titre = excluded.titre, domaine = excluded.domaine,
    accroche = excluded.accroche, description = excluded.description, points = excluded.points, faq = excluded.faq,
    prix = excluded.prix, fichiers = excluded.fichiers, apercu = excluded.apercu, controle = excluded.controle,
    cree_le = excluded.cree_le, publier_apres = excluded.publier_apres;
  return jsonb_build_object('id', v_id, 'statut', 'brouillon', 'publier_apres', p_now + interval '24 hours');
end;
$$;

-- Propriétaire (clé d'administration vérifiée par la fonction Edge)
create or replace function public.boutique_admin(p_now timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'produits', coalesce((select jsonb_agg(tcv.boutique_json(p) || jsonb_build_object(
        'statut', p.statut, 'cree_le', p.cree_le, 'publier_apres', p.publier_apres, 'controle', p.controle,
        'commandes', (select count(*) from tcv.orders o where o.product = p.id),
        'ventes', (select count(*) from tcv.orders o where o.product = p.id and o.status = 'paid'),
        'revenus', (select coalesce(sum(o.paid_amount), 0) from tcv.orders o where o.product = p.id and o.status = 'paid'))
      order by p.cree_le desc) from tcv.boutique_produits p where p.statut <> 'refuse' or p.decide_le > p_now - interval '30 days'), '[]'::jsonb),
    'totaux', jsonb_build_object(
      'publies', (select count(*) from tcv.boutique_produits where statut = 'publie'),
      'brouillons', (select count(*) from tcv.boutique_produits where statut = 'brouillon'),
      'ventes', (select count(*) from tcv.orders where product like 'bt\_%' and status = 'paid'),
      'revenus', (select coalesce(sum(paid_amount), 0) from tcv.orders where product like 'bt\_%' and status = 'paid'),
      'revenus_30j', (select coalesce(sum(paid_amount), 0) from tcv.orders where product like 'bt\_%' and status = 'paid' and paid_at > p_now - interval '30 days')))
$$;

create or replace function public.boutique_decider(p_id text, p_action text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if p_action = 'publier' then
    update tcv.boutique_produits set statut = 'publie', publie_le = coalesce(publie_le, p_now), decide_le = p_now
    where id = p_id and statut in ('brouillon', 'retire');
  elsif p_action = 'refuser' then
    update tcv.boutique_produits set statut = 'refuse', decide_le = p_now where id = p_id and statut = 'brouillon';
  elsif p_action = 'retirer' then
    update tcv.boutique_produits set statut = 'retire', decide_le = p_now where id = p_id and statut = 'publie';
  else
    return jsonb_build_object('erreur', 'action');
  end if;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', v_n = 1);
end;
$$;

-- Publication tacite : brouillons contrôlés avec succès, 24 h après leur dépôt, au plus p_max par jour
create or replace function public.boutique_publier_auto(p_now timestamptz, p_max integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_deja integer;
  v_n integer;
begin
  select count(*) into v_deja from tcv.boutique_produits where publie_le > p_now - interval '24 hours';
  if v_deja >= p_max then return 0; end if;
  update tcv.boutique_produits set statut = 'publie', publie_le = p_now
  where id in (
    select id from tcv.boutique_produits
    where statut = 'brouillon' and publier_apres <= p_now and coalesce((controle ->> 'ok')::boolean, false)
    order by cree_le limit p_max - v_deja);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Réglages utiles à la fonction Edge (serveur seulement)
create or replace function public.boutique_reglages() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin_key', (select value from tcv.settings where key = 'ADMIN_KEY'),
    'wave', (select value from tcv.settings where key = 'MANUAL_WAVE_NUMBER'))
$$;

do $$
declare f text;
begin
  foreach f in array array['boutique_catalogue()', 'boutique_produit(text)',
    'boutique_creer_commande(text, text, text, jsonb, text, timestamptz)', 'boutique_commande(text, text, timestamptz)',
    'boutique_fichier(text, text, text, timestamptz)', 'boutique_deposer(jsonb, jsonb, timestamptz)',
    'boutique_admin(timestamptz)', 'boutique_decider(text, text, timestamptz)', 'boutique_publier_auto(timestamptz, integer)',
    'boutique_reglages()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
revoke all on function tcv.boutique_json(tcv.boutique_produits) from public, anon, authenticated;

select cron.schedule('boutique-publication', '*/15 * * * *', $cron$select public.boutique_publier_auto(now(), 5)$cron$);
