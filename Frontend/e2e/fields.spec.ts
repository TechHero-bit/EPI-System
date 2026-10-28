import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import ExcelJS from "exceljs";
test.setTimeout(120000);
async function login(page: any, role = "RH") {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption(role);
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
}
async function alphabetical(select: any, skipPlaceholder = true) {
  const labels: string[] = await select
    .locator("option")
    .evaluateAll((items: HTMLOptionElement[]) =>
      items
        .filter((i) => i.value !== "__new__")
        .map((i) => i.textContent!.trim()),
    );
  const values = skipPlaceholder ? labels.slice(1) : labels;
  expect(values).toEqual(
    [...values].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true }),
    ),
  );
}
test("listas de equipamentos, tamanhos e categorias seguem ordem alfabética", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos");
  await expect(page.locator("main")).not.toContainText(/\blotes?\b/i);
  for (const select of await page.locator("select").all())
    await alphabetical(
      select,
      (await select.getAttribute("name")) !== "operation",
    );
  await page.goto("/almoxarifado/equipamentos/novo");
  await alphabetical(page.getByLabel("Categoria", { exact: true }));
  await page.goto("/almoxarifado/movimentacoes");
  for (const select of await page.locator("select").all())
    await alphabetical(
      select,
      (await select.getAttribute("name")) !== "operation",
    );
});
test("tamanho cadastrado com equipamento fica disponível nas movimentações", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos/novo");
  await page
    .getByLabel("Descrição de E.P.I.", { exact: true })
    .fill("Bota cadastrada com tamanho");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Botas de segurança");
  await page.getByLabel("Tamanho", { exact: true }).fill("41");
  await expect(
    page.getByRole("textbox", { name: /SKU|código interno/i }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Equipamento salvo.");
  await page.goto("/almoxarifado/equipamentos");
  await expect(
    page
      .locator(".catalog .equipment-card")
      .filter({ hasText: "Bota cadastrada com tamanho" })
      .locator(".variant-chips"),
  ).toContainText("41");
  await page.goto("/almoxarifado/movimentacoes");
  const selector = page.getByRole("combobox", {
    name: "Equipamento e tamanho",
    exact: true,
  });
  const id = await selector
    .locator("option")
    .filter({ hasText: "Bota cadastrada com tamanho · 41" })
    .getAttribute("value");
  await selector.selectOption(id!);
  await page.getByLabel("Quantidade de entrada", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Registrar movimentação" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Movimentação registrada",
  );
  const row = page
    .locator("tbody tr")
    .filter({ hasText: "Bota cadastrada com tamanho · 41" });
  await expect(row.locator("td").nth(3)).toHaveText("+5");
  await expect(page.locator("main")).not.toContainText(/\blotes?\b/i);
  await page.screenshot({ path: "dist/estoque-sem-lotes.png", fullPage: true });
});
test("matrícula manual aparece como registro em todas as fichas do funcionário", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/colaboradores/novo");
  await page
    .getByLabel("Funcionário(a)", { exact: true })
    .fill("Funcionário manual de teste");
  await page
    .getByLabel("Matrícula / Nº de Registro", { exact: true })
    .fill("000546");
  await page
    .getByLabel("Função", { exact: true })
    .fill("Técnico de telecomunicações");
  await page
    .getByRole("button", { name: "Salvar colaborador", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Colaborador salvo");
  for (let i = 0; i < 2; i++) {
    await page.goto("/rh/fichas/nova");
    await page
      .getByRole("button", { name: /Funcionário manual de teste/ })
      .click();
    await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
    await page
      .getByRole("button", { name: /Bota de segurança em couro/ })
      .click();
    await expect(page.getByLabel("Selecionar lote")).toHaveCount(0);
    await page.getByRole("button", { name: "Revisar seleção →" }).click();
    await page
      .getByRole("button", { name: "Gerar ficha demonstrativa" })
      .click();
    await page
      .getByRole("button", { name: "Avançar para ficha final", exact: true })
      .click();
    await expect(page).toHaveURL(/\/rh\/fichas\/[a-f0-9-]+$/);
    await expect(page.locator(".count")).toContainText("Nº de Registro 000546");
  }
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar Excel", exact: true }).click();
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile((await (await download).path())!);
  expect(book.worksheets[0]!.getCell("F6").value).toBe("000546");
  await page.screenshot({
    path: "dist/matricula-registro.png",
    fullPage: true,
  });
});
test("ficha usa catálogo somente leitura e mantém datas de entrega editáveis", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await alphabetical(
    page.getByRole("combobox", { name: "Categoria", exact: true }),
  );
  const names = await page.locator(".equipment-card strong").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "pt-BR")));
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  for (const name of ["Descrição de E.P.I.", "C.A.", "Marca", "Risco"])
    await expect(page.getByLabel(name, { exact: true })).toHaveCount(0);
  await expect(page.locator(".builder-summary")).toContainText(
    "C.A.: DEMO-1100",
  );
  await expect(page.locator(".builder-summary")).toContainText(
    "Marca: Proteção Demo",
  );
  await page
    .getByLabel("Data da entrega do item", { exact: false })
    .fill("2026-10-29");
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await page
    .getByLabel("Data da entrega (padrão dos itens)", { exact: true })
    .fill("2026-10-27");
  await expect(page.getByLabel("Funcionário(a)", { exact: true })).toHaveValue(
    "Ana Martins",
  );
  await page.getByRole("button", { name: "Gerar ficha demonstrativa" }).click();
  await expect(
    page.getByLabel("Data da entrega (padrão dos itens)", { exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Avançar para ficha final", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rh\/fichas\/[a-f0-9-]+$/);
  await expect(page.locator(".count")).toContainText("Nº de Registro DEMO-001");
  await expect(page.locator("tbody")).toContainText("29/10/2026");
  await expect(page.locator("tbody")).toContainText(
    "Bota de segurança em couro",
  );
  await expect(
    page.getByRole("heading", { name: /^Assinatura (presencial|eletrônica)$/ }),
  ).toHaveCount(0);
  const pdfDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PDF / imprimir" }).click();
  const pdf = await pdfDownload;
  const pdfPath = await pdf.path();
  expect(
    (await PDFDocument.load(await readFile(pdfPath!))).getPageCount(),
  ).toBe(1);
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar Excel", exact: true }).click();
  const excel = await xlsxDownload,
    book = new ExcelJS.Workbook();
  await book.xlsx.readFile((await excel.path())!);
  const ws = book.getWorksheet("Ficha EPI")!;
  expect(ws.getImages()).toHaveLength(1);
  expect(ws.getCell("F6").value).toBe("DEMO-001");
  expect((ws.getCell("A21").value as Date).toISOString().slice(0, 10)).toBe(
    "2026-10-29",
  );
  expect(ws.getCell("B21").value).toBe(1);
  expect(ws.getCell("C21").value).toBe("Bota de segurança em couro");
  expect(ws.getCell("E21").value).toBe("DEMO-1100");
  expect(ws.getCell("F21").value).toBe("Proteção Demo");
  expect(ws.getCell("I21").value).toBe("");
  expect(ws.getCell("H21").value).toBeNull();
  expect(ws.getCell("N21").value).toBeNull();
  const generatedDate = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date());
  expect(ws.getCell("A17").value).toBe(`Rio de Janeiro, ${generatedDate}.`);
  await page.screenshot({
    path: "dist/ficha-campos-modelo.png",
    fullPage: true,
  });
});
