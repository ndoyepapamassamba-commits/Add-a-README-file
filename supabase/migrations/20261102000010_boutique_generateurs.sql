-- Teranga Outils, documents sur mesure : le client remplit un formulaire, paie par Wave, puis l'IA rédige son document
-- (fonction Edge « boutique »). La consigne de rédaction reste privée : elle n'est jamais renvoyée au navigateur.
alter table tcv.boutique_produits
  add column type text not null default 'fichier' check (type in ('fichier', 'generateur')),
  add column formulaire jsonb check (formulaire is null or jsonb_typeof(formulaire) = 'array'),
  add column consigne text check (consigne is null or length(consigne) between 50 and 6000),
  add column exemple jsonb;

create or replace function tcv.boutique_json(p tcv.boutique_produits) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'slug', p.slug, 'titre', p.titre, 'domaine', p.domaine, 'accroche', p.accroche,
    'description', p.description, 'points', p.points, 'faq', p.faq, 'prix', p.prix, 'type', p.type,
    'fichiers', coalesce((select jsonb_agg(jsonb_build_object('nom', f ->> 'nom', 'taille', (f ->> 'taille')::integer))
                          from jsonb_array_elements(p.fichiers) f), '[]'::jsonb),
    'formulaire', p.formulaire, 'exemple', p.exemple, 'apercu', p.apercu, 'publie_le', p.publie_le)
$$;
revoke all on function tcv.boutique_json(tcv.boutique_produits) from public, anon, authenticated;

-- Commande : les réponses au formulaire (p_input) sont conservées pour les générateurs ; p_input reste facultatif
drop function public.boutique_creer_commande(text, text, text, jsonb, text, timestamptz);
create or replace function public.boutique_creer_commande(p_produit text, p_order_id text, p_token_hash text,
  p_buyer jsonb, p_ip_hash text, p_now timestamptz, p_input jsonb default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_p tcv.boutique_produits;
  v_amount integer;
begin
  select * into v_p from tcv.boutique_produits where id = p_produit and statut = 'publie';
  if not found then return jsonb_build_object('erreur', 'indisponible'); end if;
  if v_p.type = 'generateur' and (p_input is null or jsonb_typeof(p_input) <> 'object') then
    return jsonb_build_object('erreur', 'reponses');
  end if;
  if not public.tcv_hit_rate_limit('bt-order:' || coalesce(p_ip_hash, '-'), 3600, 10, p_now)
     or not public.tcv_hit_rate_limit('bt-order-global', 86400, 1000, p_now) then
    return jsonb_build_object('erreur', 'trop');
  end if;
  insert into tcv.orders (id, access_token_hash, product, template, amount, currency, status, buyer, input, ip_hash, created_at)
  values (p_order_id, p_token_hash, v_p.id, 'classique', v_p.prix, 'XOF', 'checkout', p_buyer,
          case when v_p.type = 'generateur' then p_input else null end, p_ip_hash, p_now);
  v_amount := public.tcv_hold_manual_amount(p_order_id, v_p.prix, 49, p_now, p_now - interval '72 hours', p_now - interval '48 hours');
  return jsonb_build_object('id', p_order_id, 'montant', coalesce(v_amount, v_p.prix), 'unique', v_amount is not null,
    'prix', v_p.prix, 'titre', v_p.titre, 'type', v_p.type);
end;
$$;

create or replace function public.boutique_commande(p_order_id text, p_token_hash text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o tcv.orders;
  v_p tcv.boutique_produits;
  v_amount integer;
  v_pret boolean;
begin
  select * into v_o from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%';
  if not found then return null; end if;
  select * into v_p from tcv.boutique_produits where id = v_o.product;
  if v_o.status <> 'paid' and v_o.purged_at is null then
    v_amount := public.tcv_hold_manual_amount(v_o.id, v_o.amount, 49, p_now, p_now - interval '72 hours', p_now - interval '48 hours');
  end if;
  v_pret := v_o.status = 'paid' and v_o.purged_at is null;
  return jsonb_build_object(
    'id', v_o.id, 'payee', v_o.status = 'paid', 'purgee', v_o.purged_at is not null,
    'montant', coalesce(v_amount, v_o.manual_amount, v_o.amount), 'prix', v_o.amount,
    'produit', jsonb_build_object('id', v_p.id, 'titre', v_p.titre, 'slug', v_p.slug, 'type', v_p.type),
    'payee_le', v_o.paid_at, 'telechargeable_jusqu_au', v_o.paid_at + interval '30 days',
    'fichiers', case when v_pret and v_p.type = 'fichier' then
      coalesce((select jsonb_agg(jsonb_build_object('nom', f ->> 'nom', 'taille', (f ->> 'taille')::integer))
                from jsonb_array_elements(v_p.fichiers) f), '[]'::jsonb) else '[]'::jsonb end,
    'document', case when v_pret and v_p.type = 'generateur' and v_o.document ? 'sections' then v_o.document else null end,
    'a_generer', v_pret and v_p.type = 'generateur' and not coalesce(v_o.document ? 'sections', false));
end;
$$;

-- Réserve la rédaction d'une commande payée (une seule à la fois ; reprise possible après 3 minutes)
create or replace function public.boutique_generation_reserver(p_order_id text, p_token_hash text, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_o tcv.orders;
  v_p tcv.boutique_produits;
begin
  select * into v_o from tcv.orders where id = p_order_id and access_token_hash = p_token_hash and product like 'bt\_%'
    and status = 'paid' and purged_at is null for update;
  if not found then return null; end if;
  select * into v_p from tcv.boutique_produits where id = v_o.product;
  if v_p.type <> 'generateur' or v_o.document ? 'sections' then return null; end if;
  if v_o.document ? 'en_cours' and (v_o.document ->> 'en_cours')::timestamptz > p_now - interval '3 minutes' then
    return jsonb_build_object('occupe', true);
  end if;
  update tcv.orders set document = jsonb_build_object('en_cours', p_now) where id = v_o.id;
  return jsonb_build_object('consigne', v_p.consigne, 'formulaire', v_p.formulaire, 'reponses', v_o.input,
    'titre', v_p.titre, 'essais', coalesce((v_o.document ->> 'essais')::integer, 0));
end;
$$;

create or replace function public.boutique_generation_enregistrer(p_order_id text, p_document jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  update tcv.orders set document = p_document
  where id = p_order_id and product like 'bt\_%' and status = 'paid' and purged_at is null;
  get diagnostics v_n = row_count;
  return v_n = 1;
end;
$$;

-- Dépôt d'un générateur (pas de fichier : formulaire, consigne privée et exemple de résultat)
create or replace function public.boutique_deposer_generateur(p_produit jsonb, p_now timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_slug text := p_produit ->> 'slug';
  v_id text := 'bt_' || left(replace(coalesce(p_produit ->> 'slug', ''), '-', '_'), 60);
  v_statut text;
begin
  if v_slug is null or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('erreur', 'slug'); end if;
  if jsonb_typeof(p_produit -> 'formulaire') <> 'array' or jsonb_array_length(p_produit -> 'formulaire') not between 1 and 15 then
    return jsonb_build_object('erreur', 'formulaire');
  end if;
  if (select count(*) from tcv.boutique_produits where cree_le > p_now - interval '24 hours') >= 30 then
    return jsonb_build_object('erreur', 'quota');
  end if;
  select statut into v_statut from tcv.boutique_produits where id = v_id or slug = v_slug limit 1;
  if v_statut is not null and v_statut <> 'brouillon' then return jsonb_build_object('erreur', 'existe'); end if;
  insert into tcv.boutique_produits (id, slug, titre, domaine, accroche, description, points, faq, prix, fichiers, type,
    formulaire, consigne, exemple, statut, source, controle, cree_le, publier_apres)
  values (v_id, v_slug, p_produit ->> 'titre', p_produit ->> 'domaine', p_produit ->> 'accroche', p_produit ->> 'description',
    coalesce(p_produit -> 'points', '[]'::jsonb), coalesce(p_produit -> 'faq', '[]'::jsonb), (p_produit ->> 'prix')::integer,
    '[]'::jsonb, 'generateur', p_produit -> 'formulaire', p_produit ->> 'consigne', p_produit -> 'exemple', 'brouillon',
    coalesce(p_produit ->> 'source', 'fabrique'), p_produit -> 'controle', p_now, p_now + interval '24 hours')
  on conflict (id) do update set slug = excluded.slug, titre = excluded.titre, domaine = excluded.domaine,
    accroche = excluded.accroche, description = excluded.description, points = excluded.points, faq = excluded.faq,
    prix = excluded.prix, formulaire = excluded.formulaire, consigne = excluded.consigne, exemple = excluded.exemple,
    controle = excluded.controle, cree_le = excluded.cree_le, publier_apres = excluded.publier_apres;
  return jsonb_build_object('id', v_id, 'statut', 'brouillon', 'publier_apres', p_now + interval '24 hours');
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['boutique_creer_commande(text, text, text, jsonb, text, timestamptz, jsonb)',
    'boutique_commande(text, text, timestamptz)', 'boutique_generation_reserver(text, text, timestamptz)',
    'boutique_generation_enregistrer(text, jsonb)', 'boutique_deposer_generateur(jsonb, timestamptz)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
