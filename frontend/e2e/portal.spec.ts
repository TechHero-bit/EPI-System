import { test, expect } from "@playwright/test";
test.setTimeout(120000);
async function login(page: any, role = "ADMIN") {
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
    "/almoxarifado",
    "/almoxarifado/equipamentos",
    "/almoxarifado/equipamentos/novo",
    "/almoxarifado/movimentacoes",
    "/almoxarifado/estoque",
    "/rh",
    "/rh/colaboradores",
    "/rh/colaboradores/novo",
    "/rh/fichas",
    "/rh/fichas/nova",
    "/rh/fichas/sheet-0",
    "/rh/assinaturas",
    "/relatorios",
    "/administracao",
  ];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator("main")).toContainText("DEMONSTRAÇÃO");
  }
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Administração");
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
  await login(page);
  await page.goto("/almoxarifado/equipamentos");
  await page
    .getByRole("textbox", { name: "Buscar", exact: true })
    .fill("inexistente");
  await expect(
    page.getByText("Nenhum equipamento encontrado.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await expect(
    page.getByRole("navigation").getByText("Colaboradores", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "dist/mobile-catalog.png", fullPage: true });
});
