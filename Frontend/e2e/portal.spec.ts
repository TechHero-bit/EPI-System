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
test("QR na revisão aguarda aceite em outra aba antes da ficha final", async ({
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
  await expect(page).toHaveURL(/\/rh\/fichas\/nova\?ficha=[0-9a-f-]+$/);
  await expect(
    page.getByRole("button", { name: "Avançar para ficha final", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("img", { name: "QR Code do link individual de assinatura" }),
  ).toBeVisible();
  const firstLink = await page
    .getByRole("textbox", { name: "Link de assinatura" })
    .inputValue();
  expect(firstLink).toMatch(/\/assinar\/demo-[a-f0-9]{64}$/);
  await page.screenshot({ path: "dist/revisao-qr-code.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("img", { name: "QR Code do link individual de assinatura" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({ path: "dist/revisao-qr-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  const reviewUrl = page.url();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Avançar para ficha final", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Preparar link e QR Code" }).click();
  const link = await page
    .getByRole("textbox", { name: "Link de assinatura" })
    .inputValue();
  expect(link).not.toBe(firstLink);
  expect(page.url()).toBe(reviewUrl);
  const signer = await page.context().newPage();
  await signer.goto(link);
  await signer.getByRole("button", { name: "Iniciar simulação" }).click();
  await signer.getByRole("button", { name: "Conferir documento" }).click();
  await signer.getByRole("checkbox").check();
  await signer.getByRole("button", { name: "Simular aceite" }).click();
  await expect(
    signer.getByRole("heading", { name: "Simulação concluída" }),
  ).toBeVisible();
  await expect(signer.locator(".sign-card")).toContainText(
    "entrega física continua pendente",
  );
  await page.bringToFront();
  await expect(
    page.getByText("Assinatura confirmada. Você já pode avançar", {
      exact: false,
    }),
  ).toBeVisible({ timeout: 15000 });
  await page.screenshot({
    path: "dist/revisao-assinatura-confirmada.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Avançar para ficha final", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rh\/fichas\/[0-9a-f-]+$/);
  await expect(page.locator("main")).toContainText("Assinada eletronicamente");
  await expect(page.locator("main")).toContainText("Entrega pendente");
  await expect(
    page.getByRole("button", {
      name: /Criar link|Preparar link|Registrar assinatura/,
    }),
  ).toHaveCount(0);
  const pdf = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF / imprimir" }).click();
  expect((await pdf).suggestedFilename()).toMatch(/^DEMO-.*\.pdf$/);
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar Excel", exact: true }).click();
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
  await signer.close();
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
test("assinatura presencial pode ser retomada na revisão e não aparece na ficha final", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/sheet-3");
  await expect(
    page.getByRole("heading", { name: "Assinatura presencial", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Retomar revisão", exact: true })
    .click();
  await expect(page).toHaveURL(/nova\?ficha=sheet-3$/);
  await page
    .getByLabel("Local de arquivo do original assinado", { exact: true })
    .fill("Arquivo RH, original assinado presencialmente em 22/10/2026");
  await page
    .getByRole("button", {
      name: "Registrar assinatura presencial",
      exact: true,
    })
    .click();
  await expect(
    page
      .locator(".builder")
      .getByText("Assinatura presencial registrada.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Avançar para ficha final", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rh\/fichas\/sheet-3$/);
  await expect(page.locator("main")).toContainText("Assinada presencialmente");
  await expect(
    page.getByRole("button", {
      name: "Registrar assinatura presencial",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Entrega física", exact: true }),
  ).toBeVisible();
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
