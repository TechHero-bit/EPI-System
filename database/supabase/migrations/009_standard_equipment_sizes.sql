-- MIGRATION 009 - Tamanhos padronizados de equipamentos
-- Existing values must be reviewed before applying this constraint. Never
-- replace an unknown size silently or rewrite signed sheet snapshots.
alter table public.variants
  add constraint variants_standard_size check (
    size in ('Único', 'PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'XXXG')
    or size ~ '^([1-9]|[1-6][0-9]|70)$'
  );
