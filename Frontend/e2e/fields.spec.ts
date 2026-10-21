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
test("todas as listas do estoque e categorias seguem ordem alfabética", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/estoque");
  for (const select of await page.locator("select").all())
    await alphabetical(
      select,
      !((await select.getAttribute("name")) === "condition"),
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
test("ficha congela cadastro, permite campos do modelo e exporta datas distintas", async ({
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
  await page
    .getByLabel("Descrição de E.P.I.", { exact: true })
    .fill("PAR DE BOTAS AJUSTADO");
  await page.getByLabel("C.A.", { exact: true }).fill("27300");
  await page.getByLabel("Marca", { exact: true }).fill("BRACOL");
  await page.getByLabel("Risco", { exact: true }).fill("02");
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
  await expect(page).toHaveURL(/\/rh\/fichas\/[a-f0-9-]+$/);
  await expect(page.locator(".count")).toContainText("Nº de Registro 5");
  await expect(page.locator("tbody")).toContainText("29/10/2026");
  await expect(page.locator("tbody")).toContainText("PAR DE BOTAS AJUSTADO");
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
  expect(ws.getCell("E3").value).toBe("Nº de Registro: 5");
  expect((ws.getCell("A14").value as Date).toISOString().slice(0, 10)).toBe(
    "2026-10-29",
  );
  expect(ws.getCell("B14").value).toBe(1);
  expect(ws.getCell("C14").value).toBe("PAR DE BOTAS AJUSTADO");
  expect(ws.getCell("D14").value).toBe("27300");
  expect(ws.getCell("E14").value).toBe("BRACOL");
  expect(ws.getCell("F14").value).toBe("02");
  const generatedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  expect((ws.getCell("C11").value as Date).toISOString().slice(0, 10)).toBe(
    generatedDate,
  );
  await page.screenshot({
    path: "dist/ficha-campos-modelo.png",
    fullPage: true,
  });
});
