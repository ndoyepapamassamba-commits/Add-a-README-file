-- Dossiers partagés : trois nouvelles applications (appliqué en base sous le nom « dossiers_rdv_chantier_trace »).
--   rdv      Rendez-vous Pro  : proprio (le professionnel), client (lien public commun de la page)
--   chantier Chantier Clair   : proprio (la personne qui paie), chef (chef de chantier), temoin (famille sur place)
--   trace    Lot Tracé        : proprio (producteur ou exportateur), transporteur, acheteur
-- Les valeurs déjà permises sont gardées. « membre » (lien commun des membres d'une tontine) manquait parmi les auteurs.
-- Nombre d'événements gardés par dossier, selon l'application (même table que MAX_EVENEMENTS dans la fonction Edge) :
-- tontine et chantier 3 000 (dossiers de longue durée), rdv 1 500 (une demande et une réponse par rendez-vous),
-- accord, colis et trace 400 (inchangé). La limite de 300 événements par jour et par dossier ne change pas.
-- Appliqué en base en deux temps : « dossiers_rdv_chantier_trace » puis « dossiers_plafond_par_app ».

alter table tcv.dossiers drop constraint if exists dossiers_app_check;
alter table tcv.dossiers add constraint dossiers_app_check
  check (app = any (array['accord', 'colis', 'tontine', 'rdv', 'chantier', 'trace']));

alter table tcv.dossier_evenements drop constraint if exists dossier_evenements_auteur_check;
alter table tcv.dossier_evenements add constraint dossier_evenements_auteur_check
  check (auteur = any (array['proprio', 'partie', 'livreur', 'destinataire', 'membre', 'client', 'chef', 'temoin', 'transporteur', 'acheteur', 'systeme']));

create or replace function public.dossier_evenement(p_id text, p_hash text, p_type text, p_donnees jsonb, p_maj jsonb, p_statut text, p_now timestamp with time zone)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_d tcv.dossiers; v_role text; v_prec text; v_emp text;
begin
  select * into v_d from tcv.dossiers where id = p_id for update;
  if not found then return null; end if;
  v_role := tcv.dossier_role(v_d, p_hash);
  if v_role is null then return null; end if;
  if p_maj is not null and v_role <> 'proprio' then return jsonb_build_object('erreur', 'role'); end if;
  if not public.tcv_hit_rate_limit('dos-ev:' || p_id, 86400, 300, p_now) then return jsonb_build_object('erreur', 'trop'); end if;
  if (select count(*) from tcv.dossier_evenements where dossier_id = p_id) >= (case v_d.app when 'tontine' then 3000 when 'chantier' then 3000 when 'rdv' then 1500 else 400 end) then return jsonb_build_object('erreur', 'plein'); end if;
  select empreinte into v_prec from tcv.dossier_evenements where dossier_id = p_id order by id desc limit 1;
  v_emp := encode(extensions.digest(v_prec || '|' || p_type || '|' || v_role || '|' || coalesce(p_donnees, '{}'::jsonb)::text || '|' || p_now::text, 'sha256'), 'hex');
  insert into tcv.dossier_evenements (dossier_id, auteur, type, donnees, le, precedent, empreinte)
  values (p_id, v_role, p_type, coalesce(p_donnees, '{}'::jsonb), p_now, v_prec, v_emp);
  update tcv.dossiers set maj_le = p_now, donnees = coalesce(p_maj, donnees), statut = coalesce(p_statut, statut) where id = p_id;
  return jsonb_build_object('ok', true, 'role', v_role, 'empreinte', v_emp);
end;
$function$;
