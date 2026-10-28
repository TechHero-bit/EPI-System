import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ timezoneId: "America/Sao_Paulo" });
test.setTimeout(60000);

async function login(page: Page, role = "ALMOXARIFADO") {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption(role);
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("relatório distingue cancelamentos de pendências e exporta o período exibido", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("epi-demo-v3")!);
    data.states.find((s: any) => s.sheet_id === "sheet-0").reservation_status =
      "CANCELLED";
    for (const sheet of data.sheets) sheet.issued_at = "2026-10-27T15:00:00Z";
    // In São Paulo this sheet was issued on the previous day.
    data.sheets.find((s: any) => s.id === "sheet-1").issued_at =
      "2026-10-27T01:30:00Z";
    localStorage.setItem("epi-demo-v3", JSON.stringify(data));
  });
  await page.goto("/relatorios");
  const summary = page.getByLabel("Resumo dos resultados");
  await expect(summary.locator("strong")).toHaveText(["4", "1", "2", "1"]);
  await expect(page.locator("tbody")).not.toContainText("SHEET_RESERVED");
  await page
    .getByLabel("Entrega física", { exact: true })
    .selectOption("UNCONFIRMED");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await expect(page.locator("tbody")).not.toContainText(
    /Ana Martins|Carla Nunes/,
  );
  await page
    .getByLabel("Assinatura", { exact: true })
    .selectOption("SIGNED_MANUAL");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Bruno Almeida");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Emissão de", { exact: true }).fill("2026-10-26");
  await page.getByLabel("Emissão até", { exact: true }).fill("2026-10-26");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("26/10/2026 22:30");
  await expect(summary.locator("strong")).toHaveText(["1", "0", "1", "0"]);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar relatório CSV" }).click();
  const download = await downloadReady;
  expect(download.suggestedFilename()).toBe(
    "DEMO-relatorio-fichas-entregas.csv",
  );
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"26/10/2026 22:30";"Bruno Almeida";"DEMO-002"');
  expect(csv).toContain('"Assinada presencialmente";"Entrega pendente"');
  expect(csv.split("\r\n")).toHaveLength(2);
  await page.getByLabel("Emissão de", { exact: true }).fill("2026-10-28");
  await expect(page.getByRole("alert")).toContainText("A data final");
  await expect(
    page.getByRole("button", { name: "Exportar relatório CSV" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByLabel("Buscar colaborador ou matrícula").fill("DEMO-003");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Entregue");
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.screenshot({
    path: "dist/relatorios-entregas.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "dist/relatorios-entregas-mobile.png",
    fullPage: true,
  });
});

test("entrega vincula a movimentação ao destinatário e permite buscar sua matrícula", async ({
  page,
}) => {
  await login(page, "RH");
  await page.goto("/rh/fichas/sheet-1");
  await page
    .getByLabel("Observações da entrega presencial", { exact: true })
    .fill("Equipamento entregue a Bruno Almeida.");
  await page
    .getByRole("button", {
      name: "Confirmar entrega e assinatura presencial",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Entrega e assinatura presencial confirmadas.",
  );
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page);
  await page.goto("/almoxarifado/movimentacoes");
  await expect(
    page.getByRole("columnheader", { name: "Colaborador", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Buscar", { exact: true }).fill("DEMO-002");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Bruno Almeida");
  await expect(page.locator("tbody")).toContainText("Saída");
  await page.reload();
  await page.getByLabel("Buscar", { exact: true }).fill("Bruno Almeida");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Buscar", { exact: true }).fill("");
  await page.getByLabel("Tipo de movimentação").selectOption("RECEIPT");
  for (const row of await page.locator("tbody tr").all())
    await expect(row).toContainText("Sem colaborador vinculado");
  // A recipient supplied by the API remains available even if its sheet isn't loaded.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("epi-demo-v3")!);
    data.sheets = data.sheets.filter((s: any) => s.id !== "sheet-1");
    localStorage.setItem("epi-demo-v3", JSON.stringify(data));
  });
  await page.reload();
  await page.getByLabel("Tipo de movimentação").selectOption("ISSUE");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Bruno Almeida");
  await page.screenshot({
    path: "dist/movimentacoes-colaborador.png",
    fullPage: true,
  });
});
