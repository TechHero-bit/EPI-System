# Inventário de alterações

Comparação do código local anterior (`62eb53c`) com o commit de implementação `f918c28`. A = criado, M = alterado, D = removido do estado atual (recuperável em Git/backup), R = movido preservando conteúdo. A licença oficial do EPI-System foi preservada no merge `a85984a`.

```text
M	.env.example
A	.gitattributes
M	.github/workflows/ci.yml
M	.gitignore
M	README.md
A	Backend/.env.example
M	Backend/package.json
A	Backend/scripts/write-openapi.ts
M	Backend/src/app.ts
M	Backend/src/config.ts
M	Backend/src/document.test.ts
M	Backend/src/document.ts
A	Backend/src/modules/face-match/contract.ts
A	Backend/src/openapi.ts
M	Backend/src/security.test.ts
M	Backend/src/security.ts
M	Backend/src/server.ts
A	Backend/test/api.test.ts
M	Backend/vercel.json
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
A	Frontend/.env.example
M	Frontend/angular.json
A	Frontend/e2e/portal.spec.ts
M	Frontend/package.json
A	Frontend/playwright.config.ts
M	Frontend/proxy.conf.json
M	Frontend/scripts/write-runtime-config.mjs
D	Frontend/src/app.component.html
D	Frontend/src/app.component.ts
A	Frontend/src/app/app.routes.ts
A	Frontend/src/app/components/status.component.ts
A	Frontend/src/app/core/demo-repository.ts
A	Frontend/src/app/core/models.ts
A	Frontend/src/app/core/portal.store.ts
A	Frontend/src/app/features/administracao/admin.component.ts
A	Frontend/src/app/features/almoxarifado/inventory.component.html
A	Frontend/src/app/features/almoxarifado/inventory.component.ts
A	Frontend/src/app/features/assinaturas/sign.component.ts
A	Frontend/src/app/features/auth/login.component.ts
A	Frontend/src/app/features/colaboradores/employees.component.ts
A	Frontend/src/app/features/dashboard/dashboard.component.ts
A	Frontend/src/app/features/fichas-epi/builder.component.ts
A	Frontend/src/app/features/fichas-epi/detail.component.ts
A	Frontend/src/app/features/fichas-epi/sheets.component.ts
A	Frontend/src/app/features/relatorios/reports.component.ts
A	Frontend/src/app/layouts/shell.component.ts
A	Frontend/src/app/shared/demo-document.ts
M	Frontend/src/index.html
M	Frontend/src/main.ts
A	Frontend/src/portal.css
M	Frontend/src/styles.css
A	Frontend/test/demo.test.ts
M	Frontend/tsconfig.json
M	package-lock.json
M	package.json
```

As remoções dos componentes Angular antigos foram substituídas pelas páginas com Angular Router. As migrations passaram a database/supabase/migrations; a especificação OpenAPI YAML foi substituída pela fonte TypeScript e pelo JSON gerado.
