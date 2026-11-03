-- Dossiers partagés (AccordAI, ColisPreuve) : appliqué en base sous le nom « dossiers_partages » + dossier_lire_interne.
-- Tables tcv.dossiers et tcv.dossier_evenements (historique chaîné par empreintes SHA-256), fonctions dossier_creer,
-- dossier_lire, dossier_lire_interne, dossier_evenement, dossier_photo_ajouter, dossier_photo, dossier_pass_valide
-- (service_role seulement), purge 180 jours après la dernière activité (tâche dossiers-purge).
-- Définitions complètes : voir la base (pg_get_functiondef) ; ce fichier sert de repère dans l'historique des migrations.
create or replace function public.dossier_lire_interne(p_id text) returns jsonb
language sql stable security definer set search_path = '' as $$ select donnees from tcv.dossiers where id = p_id $$;
revoke all on function public.dossier_lire_interne(text) from public, anon, authenticated;
grant execute on function public.dossier_lire_interne(text) to service_role;
-- tontine ajoutée : contrainte dossiers_app_check (accord, colis, tontine)
