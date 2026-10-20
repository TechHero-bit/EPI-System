# Inventário de alterações

Comparação do código local anterior (`62eb53c`) com o commit de implementação `f918c28`. A = criado, M = alterado, D = removido do estado atual (recuperável em Git/backup), R = movido preservando conteúdo. A licença oficial do EPI-System foi preservada no merge `a85984a`.

```text
M	.env.example
A	.gitattributes
M	.github/workflows/ci.yml
M	.gitignore
M	README.md
A	backend/.env.example
M	backend/package.json
A	backend/scripts/write-openapi.ts
M	backend/src/app.ts
M	backend/src/config.ts
M	backend/src/document.test.ts
M	backend/src/document.ts
A	backend/src/modules/face-match/contract.ts
A	backend/src/openapi.ts
M	backend/src/security.test.ts
M	backend/src/security.ts
M	backend/src/server.ts
A	backend/tests/api.test.ts
M	backend/vercel.json
A	database/README.md
A	database/functions/provision-first-admin.sql
A	database/functions/provision-member.sql
A	database/policies/README.md
A	database/schemas/validate.sql
A	database/scripts/build-setup.mjs
A	database/setup.sql
A	database/supabase/config.toml
R099	database/migrations/202610190001_init.sql	database/supabase/migrations/202610190001_init.sql
R100	database/migrations/202610200001_audit_email_verification.sql	database/supabase/migrations/202610200001_audit_email_verification.sql
R100	database/migrations/202610200002_manual_signature.sql	database/supabase/migrations/202610200002_manual_signature.sql
A	database/supabase/migrations/20261020120000_reservations_and_access.sql
A	database/supabase/migrations/20261020130000_signing_identity.sql
A	database/supabase/seed.sql
A	database/tests/integration.test.ts
M	docs/ARCHITECTURE.md
A	docs/VALIDATION.md
A	docs/openapi.json
D	docs/openapi.yaml
A	frontend/.env.example
M	frontend/angular.json
A	frontend/e2e/portal.spec.ts
M	frontend/package.json
A	frontend/playwright.config.ts
M	frontend/proxy.conf.json
M	frontend/scripts/write-runtime-config.mjs
D	frontend/src/app.component.html
D	frontend/src/app.component.ts
A	frontend/src/app/app.routes.ts
A	frontend/src/app/components/status.component.ts
A	frontend/src/app/core/demo-repository.ts
A	frontend/src/app/core/models.ts
A	frontend/src/app/core/portal.store.ts
A	frontend/src/app/features/administracao/admin.component.ts
A	frontend/src/app/features/almoxarifado/inventory.component.html
A	frontend/src/app/features/almoxarifado/inventory.component.ts
A	frontend/src/app/features/assinaturas/sign.component.ts
A	frontend/src/app/features/auth/login.component.ts
A	frontend/src/app/features/colaboradores/employees.component.ts
A	frontend/src/app/features/dashboard/dashboard.component.ts
A	frontend/src/app/features/fichas-epi/builder.component.ts
A	frontend/src/app/features/fichas-epi/detail.component.ts
A	frontend/src/app/features/fichas-epi/sheets.component.ts
A	frontend/src/app/features/relatorios/reports.component.ts
A	frontend/src/app/layouts/shell.component.ts
A	frontend/src/app/shared/demo-document.ts
M	frontend/src/index.html
M	frontend/src/main.ts
A	frontend/src/portal.css
M	frontend/src/styles.css
A	frontend/tests/demo.test.ts
M	frontend/tsconfig.json
M	package-lock.json
M	package.json
```

As remoções dos componentes Angular antigos foram substituídas pelas páginas com Angular Router. As migrations passaram a database/supabase/migrations; a especificação OpenAPI YAML foi substituída pela fonte TypeScript e pelo JSON gerado.
