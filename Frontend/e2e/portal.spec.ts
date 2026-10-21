import { test, expect } from "@playwright/test";
test.setTimeout(120000);
async function login(page: any, role = "RH") {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption(role);
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test("todas as rotas principais abrem diretamente, inclusive após refresh", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await login(page);
  const paths = [
    "/dashboard",
    "/rh",
    "/rh/colaboradores",
    "/rh/colaboradores/novo",
    "/rh/fichas",
    "/rh/fichas/nova",
    "/rh/fichas/sheet-0",
    "/rh/assinaturas",
    "/relatorios",
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("main")).toContainText("DEMONSTRAÇÃO");
  }
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Relatórios");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page, "ALMOXARIFADO");
  for (const path of [
    "/dashboard",
    "/almoxarifado",
    "/almoxarifado/equipamentos",
    "/almoxarifado/equipamentos/novo",
    "/almoxarifado/movimentacoes",
    "/almoxarifado/estoque",
    "/relatorios",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test("assistente emite ficha, exporta PDF/Excel e mantém entrega separada", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  await page.getByRole("button", { name: /Luva de proteção mecânica/ }).click();
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await page
    .getByText("Método de assinatura", { exact: false })
    .locator("select")
    .selectOption("ELECTRONIC");
  await page.getByRole("button", { name: "Gerar ficha demonstrativa" }).click();
  await expect(page).toHaveURL(/\/rh\/fichas\/[0-9a-f-]+$/);
  await expect(page.locator("main")).toContainText("Entrega pendente");
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF / imprimir" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^DEMO-.*\.pdf$/);
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar Excel" }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole("button", { name: "Criar link de simulação" }).click();
  const link = await page
    .getByRole("textbox", { name: "Link de assinatura" })
    .inputValue();
  await page.goto(link);
  await page.getByRole("button", { name: "Iniciar simulação" }).click();
  await page.getByRole("button", { name: "Conferir documento" }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Simular aceite" }).click();
  await expect(
    page.getByRole("heading", { name: "Simulação concluída" }),
  ).toBeVisible();
  await expect(page.locator(".sign-card")).toContainText(
    "entrega física continua pendente",
  );
});
test("perfis restringem rotas e menu", async ({ page }) => {
  await login(page, "ALMOXARIFADO");
  await expect(
    page.getByRole("navigation").getByText("Colaboradores", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/rh/colaboradores");
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/administracao");
  await expect(page).toHaveURL(/dashboard/);
});
test("busca e layout móvel funcionam", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos");
  await page
    .getByRole("textbox", { name: "Buscar", exact: true })
    .fill("inexistente");
  await expect(
    page.getByText("Nenhum equipamento encontrado.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("navigation").getByText("Equipamentos", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Equipamentos", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar", exact: true }).fill("");
  await page.screenshot({ path: "dist/mobile-catalog.png", fullPage: true });
});
test("login oferece apenas RH e Almoxarifado com dashboards específicos", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator("#profile option")).toHaveText([
    "Almoxarifado",
    "RH",
  ]);
  await login(page);
  await expect(
    page.getByRole("heading", { name: "Dashboard do RH", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Status das assinaturas", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Atenção ao estoque", exact: true }),
  ).toHaveCount(0);
  const nav = page.getByRole("navigation");
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveCount(1);
  await expect(
    nav.locator(
      'a[href="/rh"],a[href="/almoxarifado"],a[href="/rh/assinaturas"]',
    ),
  ).toHaveCount(0);
  await page.screenshot({ path: "dist/dashboard-rh.png", fullPage: true });
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page, "ALMOXARIFADO");
  await expect(
    page.getByRole("heading", {
      name: "Dashboard do Almoxarifado",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Atenção ao estoque", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Status das assinaturas", exact: true }),
  ).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveCount(1);
  await page.screenshot({
    path: "dist/dashboard-almoxarifado.png",
    fullPage: true,
  });
});
test("cadastro simplificado cria e filtra uma categoria sem emotes", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos/novo");
  await expect(page.locator("#photo,#life")).toHaveCount(0);
  await expect(
    page.getByLabel("Validade do CA", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Descrição de E.P.I.", { exact: true })
    .fill("Protetor auditivo de teste");
  await page.getByLabel("Categoria", { exact: true }).selectOption("__new__");
  await page
    .getByLabel("Nome da nova categoria", { exact: true })
    .fill("Proteção auditiva");
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Equipamento salvo.");
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(
    "Proteção auditiva",
  );
  await expect(
    page.getByLabel("Nome da nova categoria", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "dist/cadastro-equipamento.png",
    fullPage: true,
  });
  await page.goto("/almoxarifado/equipamentos");
  await expect(page.locator(".equipment-visual")).toHaveCount(0);
  await page.getByLabel("Filtrar categoria").selectOption("Proteção auditiva");
  await expect(page.locator(".catalog .equipment-card")).toHaveCount(1);
  await expect(page.locator(".catalog")).toContainText(
    "Protetor auditivo de teste",
  );
  await expect(page.locator(".catalog")).not.toContainText(/♧|◒|✋|♜/);
});
test("assinaturas ficam disponíveis como filtro da lista de fichas", async ({
  page,
}) => {
  await login(page);
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "Assinaturas", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Pendentes Conferir fichas/ }).click();
  await expect(page).toHaveURL(/rh\/fichas\?status=PENDING/);
  await expect(
    page.getByRole("combobox", { name: "Filtrar assinatura" }),
  ).toHaveValue("PENDING");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Filtrar assinatura" })
    .selectOption("SIGNED_MANUAL");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("combobox", { name: "Filtrar assinatura" })
    .selectOption("");
  await expect(page.locator("tbody tr")).toHaveCount(4);
});
