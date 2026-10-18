-- Pack Stage: allow product 'stage' on tcv.orders. Idempotent (safe to run again).
-- orders_product_check is the name Postgres gave to the inline column check of 20261018000001_schema.sql.
alter table tcv.orders drop constraint if exists orders_product_check;
alter table tcv.orders add constraint orders_product_check check (product in ('cv', 'lettre', 'pack', 'stage'));
