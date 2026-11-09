import { test, expect } from "@playwright/test";
test("tamanhos fixos no cadastro e filtros de categoria, tamanho e busca na ficha", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption("ALMOXARIFADO");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/almoxarifado/equipamentos/novo");
  const grid = page.getByRole("radiogroup", { name: "Grade de tamanhos" });
  await expect(grid.getByRole("radio")).toHaveCount(3);
  await grid.getByRole("radio", { name: "Números" }).check();
  await expect(page.locator(".size-options input[type=checkbox]")).toHaveCount(70);
  await page.getByLabel("Do número").fill("38");
  await page.getByLabel("Até o número").fill("44");
  await page.getByRole("button", { name: "Marcar intervalo" }).click();
  await expect(page.locator(".size-options input:checked")).toHaveCount(7);
  await page.getByRole("checkbox", { name: "Tamanho 44" }).uncheck();
  await expect(page.locator("#size-help")).toContainText("Marcados: 38, 39, 40, 41, 42, 43.");
  await page
    .getByLabel("Descrição de E.P.I.", { exact: true })
    .fill("Bota teste padronizada");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Botas de segurança");
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Equipamento salvo.");
  await page.goto("/almoxarifado/equipamentos");
  await page.getByLabel("Filtrar categoria").selectOption("Botas de segurança");
  await page.getByLabel("Filtrar tamanho").selectOption("41");
  await expect(page.locator(".catalog article")).toHaveCount(1);
  await expect(page.locator(".catalog article")).toContainText(
    "Bota teste padronizada",
  );
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.getByLabel("Explorar como").selectOption("RH");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await page.waitForURL("**/dashboard");
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page.getByRole("button", { name: "Ver todos os equipamentos" }).click();
  const filters = page.locator(".equipment-filters");
  expect(
    await filters
      .locator("select,input")
      .evaluateAll((elements) =>
        elements.map((el) => el.getAttribute("aria-label")),
      ),
  ).toEqual(["Categoria", "Tamanho", "Buscar equipamento"]);
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Botas de segurança");
  await page.getByLabel("Tamanho", { exact: true }).selectOption("40");
  // A bota cadastrada acima (38 a 43) também tem 40, mas sem saldo: aparece bloqueada.
  await expect(page.locator(".equipment-grid .equipment-card")).toHaveCount(2);
  const empty = page
    .locator(".equipment-grid .equipment-card")
    .filter({ hasText: "Bota teste padronizada" });
  await expect(empty).toBeDisabled();
  await expect(empty).toContainText("Sem estoque");
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Luvas de proteção");
  await expect(page.getByLabel("Tamanho", { exact: true })).toHaveValue("");
  await expect(
    page
      .getByLabel("Tamanho", { exact: true })
      .locator('optgroup[label="Números"]'),
  ).toHaveCount(0);
  await page.getByLabel("Tamanho", { exact: true }).selectOption("M");
  await page.getByLabel("Buscar equipamento").fill("DEMO-1102");
  await expect(page.locator(".equipment-grid .equipment-card")).toHaveCount(1);
  await expect(page.locator(".equipment-grid .equipment-card")).toContainText(
    "Luva de proteção mecânica",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "dist/standard-sizes-mobile.png",
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.getByLabel("Buscar equipamento").fill("inexistente");
  await expect(page.locator(".equipment-grid")).toContainText(
    "Nenhum equipamento encontrado.",
  );
  await page.getByLabel("Buscar equipamento").fill("");
  await page.getByLabel("Categoria", { exact: true }).selectOption("");
  await expect(page.locator(".builder-summary")).toContainText(
    "Bota de segurança em couro",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "dist/standard-sizes-desktop.png",
    fullPage: true,
  });
});
