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
test("confirmação da seleção lista todas as unidades e só avança após confirmar", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  for (let i = 0; i < 2; i++)
    await page
      .getByRole("button", { name: /Bota de segurança em couro/ })
      .click();
  await page.getByLabel("Data da entrega do item").first().fill("2026-11-10");
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirmar seleção" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(2);
  await expect(dialog.getByRole("listitem").first()).toContainText(
    "10/11/2026",
  );
  await expect(dialog).toContainText("Tamanho 40");
  await dialog.getByRole("button", { name: "Voltar e ajustar" }).click();
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Escolha os equipamentos e tamanhos" }),
  ).toBeVisible();
  await expect(page.getByLabel("Data da entrega do item").first()).toHaveValue(
    "2026-11-10",
  );
  for (let i = 0; i < 11; i++)
    await page
      .getByRole("button", { name: /Luva de proteção mecânica/ })
      .click();
  for (let i = 0; i < 2; i++)
    await page.getByRole("button", { name: /Cinto com talabarte/ }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "3 · Revisão e assinatura" }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("listitem")).toHaveCount(15);
  await expect(
    dialog.getByRole("button", { name: "Confirmar e avançar →" }),
  ).toBeInViewport();
  await dialog.getByRole("listitem").last().scrollIntoViewIfNeeded();
  await expect(dialog.getByRole("listitem").last()).toBeInViewport();
  await page.screenshot({ path: "dist/confirmacao-equipamentos-mobile.png" });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await dialog.getByRole("button", { name: "Confirmar e avançar →" }).click();
  await expect(
    page.getByRole("heading", { name: "Revisar ficha e assinatura" }),
  ).toBeVisible();
  await expect(dialog).not.toBeVisible();
  expect(new URL(page.url()).searchParams.has("ficha")).toBe(false);
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
  await page.getByRole("button", { name: "Confirmar e avançar →" }).click();
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
  await expect(
    signer.getByRole("button", { name: "Conferir documento" }),
  ).toHaveCount(0);
  await expect(
    signer.getByRole("button", { name: "Simular aceite" }),
  ).toBeDisabled();
  await signer
    .getByLabel("Seu nome completo", { exact: true })
    .fill("Ana Martins");
  await signer
    .getByLabel("Estilo da assinatura", { exact: true })
    .selectOption("handwritten");
  await expect(
    signer.getByRole("button", { name: "Simular aceite" }),
  ).toBeDisabled();
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
test("ficha final oferece apenas detalhes e confirma entrega junto da assinatura presencial", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await page.getByRole("button", { name: "Confirmar e avançar →" }).click();
  await page.getByRole("button", { name: "Gerar ficha demonstrativa" }).click();
  await expect(page).toHaveURL(/\/rh\/fichas\/nova\?ficha=[0-9a-f-]+$/);
  const reviewUrl = new URL(page.url());
  const id = reviewUrl.searchParams.get("ficha")!;
  await expect(
    page.getByRole("link", { name: /Retomar revisão|Voltar à revisão/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Assinatura presencial", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Local de arquivo do original assinado", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Registrar assinatura presencial",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Avançar para ficha final", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/rh/fichas/${id}$`));
  await expect(
    page.getByRole("link", { name: /Retomar revisão|Voltar à revisão/ }),
  ).toHaveCount(0);
  await expect(page.locator(".detail-meta").first()).toContainText("Pendente");
  await expect(page.locator("main")).not.toContainText(
    "Assinada presencialmente",
  );
  await expect(
    page.getByRole("button", {
      name: "Registrar assinatura presencial",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Entrega física", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "← Voltar às fichas", exact: true })
    .click();
  await expect(page.getByRole("link", { name: /Retomar revisão/ })).toHaveCount(
    0,
  );
  const row = page
    .getByRole("row")
    .filter({ has: page.locator(`a[href="/rh/fichas/${id}"]`) });
  await expect(row.getByRole("link")).toHaveCount(1);
  await row.getByRole("link", { name: "Ver detalhes", exact: true }).click();
  await page
    .getByLabel("Observações da entrega presencial", { exact: true })
    .fill("Ana Martins recebeu os equipamentos e já assinou presencialmente.");
  await page
    .getByRole("button", {
      name: "Confirmar entrega e assinatura presencial",
      exact: true,
    })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Entrega e assinatura presencial confirmadas.",
  );
  await expect(page.locator(".detail-meta").first()).toContainText(
    "Assinada presencialmente",
  );
  await expect(page.locator(".detail-meta").first()).toContainText("Entregue");
  await expect(page.locator(".detail-meta").first()).not.toContainText(
    /Pendente|Entrega pendente|Reservado/,
  );
  await page.reload();
  await expect(page.locator(".detail-meta").first()).toContainText(
    "Assinada presencialmente",
  );
  await page
    .getByRole("link", { name: "← Voltar às fichas", exact: true })
    .click();
  await expect(row).toContainText("Assinada presencialmente");
  await expect(row).toContainText("Entregue");
  await page
    .getByRole("combobox", { name: "Filtrar status" })
    .selectOption("PENDING");
  await expect(row).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filtrar status" })
    .selectOption("UNCONFIRMED");
  await expect(row).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Filtrar status" })
    .selectOption("SIGNED_MANUAL");
  await expect(row).toBeVisible();
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
  ).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Estoque", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".stats")).not.toContainText(
    /Saldo disponível|Unidades reservadas|Estoque baixo/,
  );
  await expect(page.locator(".stats")).toContainText("Tamanhos cadastrados");
  await page.goto("/almoxarifado/estoque");
  await expect(page).toHaveURL(/\/almoxarifado\/equipamentos$/);
  await expect(page.locator(".catalog")).not.toContainText("disponíveis");
  await page.goto("/dashboard");
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
  await page.getByLabel("Tamanho", { exact: true }).selectOption("M");
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
  await expect(page.locator(".catalog .variant-chips")).toHaveText("M");
  await page.reload();
  const equipment = page
    .locator(".catalog .equipment-card")
    .filter({ hasText: "Protetor auditivo de teste" });
  await equipment.getByRole("button", { name: "Editar equipamento" }).click();
  await page.getByLabel("Marca", { exact: true }).fill("Marca atualizada");
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Equipamento salvo.");
  await expect(equipment.locator(".variant-chips .chip")).toHaveCount(1);
  await expect(equipment).toContainText("Marca atualizada");
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
    page.getByRole("combobox", { name: "Filtrar status" }),
  ).toHaveValue("PENDING");
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Filtrar status" })
    .selectOption("SIGNED_MANUAL");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Filtrar status" }).selectOption("");
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("entrega pendente filtra a entrega física sem depender da assinatura", async ({
  page,
}) => {
  await login(page);
  // Cover every signature state, as well as cancelled and delivered sheets.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("epi-demo-v3")!);
    data.states.find((s: any) => s.sheet_id === "sheet-0").reservation_status =
      "CANCELLED";
    const source = data.sheets.find((s: any) => s.id === "sheet-2");
    data.sheets.push({ ...source, id: "sheet-electronic-pending" });
    data.states.push({
      sheet_id: "sheet-electronic-pending",
      signature_status: "SIGNED_ELECTRONIC",
      receipt_status: "UNCONFIRMED",
      reservation_status: "RESERVED",
    });
    localStorage.setItem("epi-demo-v3", JSON.stringify(data));
  });
  await page.goto("/dashboard");
  await page.getByRole("link", { name: "Ver todas (3)", exact: true }).click();
  await expect(page).toHaveURL(/rh\/fichas\?status=UNCONFIRMED/);
  const filter = page.getByRole("combobox", { name: "Filtrar status" });
  await expect(filter).toHaveValue("UNCONFIRMED");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  for (const row of await page.locator("tbody tr").all())
    await expect(row.locator("td").nth(4)).toHaveText("Entrega pendente");
  await expect(page.locator("tbody")).toContainText("Assinada presencialmente");
  await expect(page.locator("tbody")).toContainText("Assinada eletronicamente");
  await expect(page.locator("tbody")).toContainText("Pendente");
  await expect(page.locator("tbody")).not.toContainText(/Cancelado|Entregue/);
  await page.reload();
  await expect(filter).toHaveValue("UNCONFIRMED");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Buscar ficha").fill("Daniel");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByLabel("Buscar ficha").fill("inexistente");
  await expect(page.locator("tbody")).toContainText("Nenhuma ficha encontrada");
  await page.goto("/rh/fichas?status=UNCONFIRMED&employee=employee-1");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Bruno Almeida");
  await filter.selectOption("");
  await page.goto("/rh/fichas");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await filter.selectOption("UNCONFIRMED");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page.screenshot({
    path: "dist/filtro-entrega-pendente.png",
    fullPage: true,
  });
});

test("cadastro exige tamanho sem solicitar código interno", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos/novo");
  await expect(
    page.getByRole("textbox", { name: /SKU|código interno/i }),
  ).toHaveCount(0);
  await page
    .getByLabel("Descrição de E.P.I.", { exact: true })
    .fill("Equipamento com tamanho obrigatório");
  await page
    .getByLabel("Categoria", { exact: true })
    .selectOption("Luvas de proteção");
  await page.getByLabel("Tamanho", { exact: true }).selectOption([]);
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("epi-demo-v3")!).products.length,
    ),
  ).toBe(8);
  await page.getByLabel("Tamanho", { exact: true }).selectOption("G");
  await page
    .getByRole("button", { name: "Salvar equipamento", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Equipamento salvo.");
  await page.goto("/almoxarifado/equipamentos");
  const cards = page
    .locator(".catalog .equipment-card")
    .filter({ hasText: "Equipamento com tamanho obrigatório" });
  await expect(cards).toHaveCount(1);
  await expect(cards.locator(".variant-chips")).toHaveText("G");
});
