-- Teranga CV: product "premium" (CV Premium, 5 000 FCFA).
-- tcv.orders.product was created with an inline check, which Postgres names orders_product_check.
-- This constraint also accepts 'stage' (Pack Stage, migration 20261018000003_stage.sql), so the two
-- products can be deployed in either order without one migration removing the other's product.
-- Idempotent: drop if exists, then add. Runs on Supabase Postgres 17 and in PGlite (backend tests).

alter table tcv.orders drop constraint if exists orders_product_check;
alter table tcv.orders add constraint orders_product_check
  check (product in ('cv', 'lettre', 'pack', 'stage', 'premium'));
