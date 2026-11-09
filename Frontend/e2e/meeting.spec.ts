import { test, expect, type Page } from "@playwright/test";
test.setTimeout(120000);
// Fluxos pedidos na reunião de validação, na demonstração (sem rede).
async function login(page: Page, role = "RH") {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption(role);
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
}

test("1.2/1.3 busca por C.A. seleciona o item ou cadastra no mesmo fluxo, com justificativa", async ({
  page,
}) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/movimentacoes");
  // A movimentação fica no topo, antes das listas.
  const headings = await page.locator("main h2").allTextContents();
  expect(headings[0]).toBe("Registrar movimentação");
  await page.getByLabel("Buscar pelo C.A.").fill("DEMO-1102");
  await page.getByRole("button", { name: "Buscar C.A." }).click();
  await expect(page.getByText("Informe somente os números do C.A.")).toBeVisible();
  await page.getByLabel("Buscar pelo C.A.").fill("9900202");
  await page.getByRole("button", { name: "Buscar C.A." }).click();
  await page
    .getByRole("button", { name: "Cadastrar equipamento com este C.A." })
    .click();
  // Consulta fictícia preenche validade e dados; tudo continua editável.
  await expect(page.getByLabel("Validade do CA", { exact: true })).toHaveValue("2028-03-15");
  await expect(page.getByLabel("Descrição de E.P.I.", { exact: true })).toHaveValue(
    "LUVA PARA PROTEÇÃO CONTRA AGENTES MECÂNICOS",
  );
  await page.getByLabel("Descrição de E.P.I.", { exact: true }).fill("Luva de vaqueta demonstrativa");
  await page.getByLabel("Categoria", { exact: true }).selectOption("Luvas de proteção");
  const grid = page.getByRole("radiogroup", { name: "Grade de tamanhos" });
  await grid.getByRole("radio", { name: "Letras" }).check();
  for (const size of ["P", "M", "G"])
    await page.getByRole("checkbox", { name: `Tamanho ${size}`, exact: true }).check();
  await page.getByRole("button", { name: "Salvar equipamento" }).click();
  await expect(page.getByRole("status").first()).toContainText("Equipamento salvo.");
  // Item recém-cadastrado já fica selecionado, com os tamanhos ao lado.
  await expect(page.getByRole("combobox", { name: "Equipamento", exact: true })).toHaveValue(/.+/);
  const sizes = page.locator(".size-choice .size-option");
  await expect(sizes).toHaveCount(3);
  await sizes.filter({ hasText: "M" }).getByRole("radio").check();
  await page.getByLabel("Quantidade recebida").fill("4");
  const submit = page.getByRole("button", { name: "Registrar movimentação" });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Justificativa (obrigatória)").fill("Nota fiscal fictícia 900");
  await submit.click();
  await expect(page.getByRole("status").first()).toContainText("Movimentação registrada");
  await expect(page.locator(".size-choice")).toContainText("4 disp.");
  // Reentrada pelo C.A.: só escolhe tamanho e quantidade.
  await page.getByLabel("Buscar pelo C.A.").fill("9900202");
  await page.getByRole("button", { name: "Buscar C.A." }).click();
  await expect(page.getByText(/Equipamento encontrado: Luva de vaqueta demonstrativa/)).toBeVisible();
  await page.getByLabel("Operação").selectOption("WITHDRAWAL");
  await sizes.filter({ hasText: "M" }).getByRole("radio").check();
  await page.getByLabel("Quantidade retirada").fill("1");
  await page.getByLabel("Justificativa (obrigatória)").fill("Retirada para treinamento");
  await submit.click();
  await expect(page.locator(".size-choice")).toContainText("3 disp.");
  const row = page.locator("tbody tr").filter({ hasText: "Retirada para treinamento" });
  await expect(row).toContainText("Retirada");
  await expect(row).toContainText("-1");
  // Catálogo mostra o estoque ao lado de cada tamanho.
  await page.goto("/almoxarifado/equipamentos");
  const card = page.locator(".catalog .equipment-card").filter({ hasText: "Luva de vaqueta" });
  await expect(card.locator(".variant-chips")).toContainText("M 3 un.");
  await expect(card.locator(".variant-chips")).toContainText("P 0 un.");
});

test("1.1 edição: tamanho com histórico é desativado em vez de removido", async ({ page }) => {
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos");
  const card = page.locator(".catalog .equipment-card").filter({ hasText: "Bota de segurança em couro" });
  await card.getByRole("button", { name: "Editar equipamento" }).click();
  await page.getByRole("checkbox", { name: "Tamanho 41", exact: true }).check();
  await page.getByRole("checkbox", { name: "Tamanho 40", exact: true }).uncheck();
  await page.getByRole("button", { name: "Salvar equipamento" }).click();
  await expect(page.getByRole("status").first()).toContainText("desativados: 40");
  await expect(card.locator(".variant-chips")).toContainText(/40 \d+ un\. · inativo/);
  await expect(card.locator(".variant-chips")).toContainText("41 0 un.");
});

test("1.4 alertas de C.A. em 30, 15 e 7 dias e vencido, com texto, no dashboard e catálogo", async ({
  page,
}) => {
  for (const role of ["RH", "ALMOXARIFADO"]) {
    await login(page, role);
    const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Validade dos C.A." }) });
    for (const text of ["C.A. vencido", "Vence em até 7 dias", "Vence em até 15 dias", "Vence em até 30 dias"])
      await expect(card.locator(".ca-alert-list")).toContainText(text);
    // Mais urgente primeiro.
    await expect(card.locator(".ca-alert-list li").first()).toContainText("C.A. vencido");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
  }
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/equipamentos");
  await expect(page.locator(".catalog .equipment-card").first()).toContainText("C.A. vencido");
  await expect(page.locator(".catalog .equipment-card").filter({ hasText: "Capacete com jugular" })).toContainText(
    "Vence em até 7 dias",
  );
});

test("2.2/2.3 kit vem marcado, exige tamanho, item sem saldo bloqueado; lista só ao filtrar; 'todas' volta tudo", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await expect(page.locator(".equipment-grid")).toHaveCount(0);
  const kit = page.locator(".kit-panel");
  await expect(kit).toContainText("Cliente Fictício Alfa · Operador(a)");
  await expect(kit.getByRole("checkbox", { name: "Incluir Luva de proteção mecânica" })).toHaveCount(2);
  await expect(kit.getByRole("checkbox", { name: "Incluir Luva de proteção mecânica" }).first()).toBeChecked();
  // Bota impermeável: sem saldo e C.A. vencido; sinalizada e não pode ser incluída.
  const out = kit.locator(".kit-row").filter({ hasText: "Bota impermeável" });
  await expect(out).toContainText("Sem estoque — não pode ser incluído");
  await expect(out.getByRole("checkbox")).toBeDisabled();
  await expect(out.getByRole("checkbox")).not.toBeChecked();
  // Produtos com um único tamanho já vêm com ele escolhido; sem tamanho, o item não entra.
  const gloves = kit.getByRole("combobox", { name: "Tamanho de Luva de proteção mecânica" });
  await expect(gloves.first()).toHaveValue("M");
  await gloves.first().selectOption("");
  await page.getByRole("button", { name: "Adicionar itens marcados à ficha" }).click();
  await expect(page.getByRole("alert").first()).toContainText("escolha o tamanho");
  await expect(page.locator(".builder-summary .draft-item")).toHaveCount(2);
  await kit.getByRole("combobox", { name: "Tamanho de Luva de proteção mecânica" }).selectOption("M");
  await page.getByRole("button", { name: "Adicionar itens marcados à ficha" }).click();
  await expect(page.locator(".builder-summary .draft-item")).toHaveCount(3);
  // Lista completa só depois de filtrar; "Todas as categorias" devolve tudo.
  await page.getByLabel("Categoria", { exact: true }).selectOption("Luvas de proteção");
  await page.getByLabel("Tamanho", { exact: true }).selectOption("M");
  await expect(page.locator(".equipment-grid .equipment-card")).toHaveCount(1);
  await page.getByLabel("Categoria", { exact: true }).selectOption("");
  await expect(page.getByLabel("Tamanho", { exact: true })).toHaveValue("");
  await expect(page.locator(".equipment-grid .equipment-card")).toHaveCount(8);
  const empty = page.locator(".equipment-grid .equipment-card").filter({ hasText: "Bota impermeável" });
  await expect(empty).toBeDisabled();
  await expect(empty).toContainText("não pode ser incluído");
  // Remover item e data por item continuam disponíveis.
  await page.getByRole("button", { name: "Remover item" }).first().click();
  await expect(page.locator(".builder-summary .draft-item")).toHaveCount(2);
  await expect(page.getByLabel("Data da entrega do item").first()).toBeVisible();
});

test("2.1/2.2 colaboradores filtram por cliente, unidade e RAC; RH cadastra kit", async ({ page }) => {
  await login(page);
  await page.goto("/rh/colaboradores");
  await page.getByLabel("Filtrar RAC").selectOption({ label: "RAC 03 - Eletricidade" });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody tr")).toContainText("Carla Nunes");
  await page.getByLabel("Filtrar RAC").selectOption("");
  await page.getByLabel("Filtrar cliente").selectOption({ label: "Cliente Fictício Beta" });
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await page.getByLabel("Filtrar cliente").selectOption("");
  await page.getByLabel("Filtrar unidade").selectOption({ label: "Unidade fictícia Sul" });
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator("tbody")).toContainText("Nenhum colaborador encontrado.");
  await page.getByLabel("Filtrar unidade").selectOption("");
  // Edição usa listas (sem texto livre) e seleção múltipla de RAC.
  await page.locator("tbody tr").filter({ hasText: "Bruno Almeida" }).getByRole("button", { name: "Editar" }).click();
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Cliente Fictício Alfa" });
  await page.getByRole("combobox", { name: "Unidade de trabalho", exact: true }).selectOption({ label: "Unidade fictícia Sul" });
  await page.getByRole("checkbox", { name: "RAC 03 - Eletricidade" }).check();
  await page.getByRole("button", { name: "Salvar colaborador" }).click();
  await expect(page.getByRole("status").first()).toContainText("Colaborador salvo.");
  await page.getByLabel("Filtrar unidade").selectOption({ label: "Unidade fictícia Sul" });
  await expect(page.locator("tbody tr")).toContainText("Bruno Almeida");
  await expect(page.locator("tbody tr")).toContainText("RAC 02 - Espaço confinado, RAC 03 - Eletricidade");
  // Kits
  await page.goto("/rh/kits");
  await page.getByRole("combobox", { name: "Cliente", exact: true }).selectOption({ label: "Cliente Fictício Beta" });
  await page.getByLabel("Função", { exact: true }).fill("Técnico(a)");
  await page.getByLabel("Quantidade de Capacete com suspensão").fill("1");
  await page.getByLabel("Quantidade de Cinto paraquedista").fill("1");
  await page.getByRole("button", { name: "Salvar kit" }).click();
  await expect(page.getByRole("status").first()).toContainText("Kit salvo.");
  await expect(page.locator("tbody tr").filter({ hasText: "Técnico(a)" })).toContainText("1 × Cinto paraquedista");
});

test("3.1/3.2/3.3 cancelar pendente, devolver item entregue e desligamento abre devolução demissional", async ({
  page,
}) => {
  await login(page);
  // 3.1 Cancelamento com motivo obrigatório na tela de detalhes.
  await page.goto("/rh/fichas/sheet-0");
  const cancel = page.getByRole("button", { name: "Cancelar reserva e liberar itens" });
  await expect(cancel).toBeDisabled();
  await page.getByLabel("Motivo do cancelamento").fill("Troca de tamanho solicitada");
  await cancel.click();
  await expect(page.getByRole("status").first()).toContainText("Reserva cancelada.");
  await expect(page.locator(".detail-meta").first()).toContainText("Cancelado");
  await expect(page.getByRole("link", { name: "Registrar devolução" })).toHaveCount(0);
  // 3.3 Data de desligamento abre o popup com a última ficha assinada.
  await page.goto("/rh/colaboradores");
  await page.locator("tbody tr").filter({ hasText: "Carla Nunes" }).getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Data da Demissão (quando houver)").fill("2026-11-09");
  await page.getByRole("button", { name: "Salvar colaborador" }).click();
  const dialog = page.getByRole("dialog", { name: "Gerar devolução demissional?" });
  await expect(dialog).toContainText("Carla Nunes");
  await dialog.getByRole("button", { name: "Gerar devolução demissional" }).click();
  await expect(page).toHaveURL(/\/rh\/fichas\/sheet-2\/devolucao\?desligamento=1/);
  await expect(page.getByRole("heading", { name: "Devolução demissional" })).toBeVisible();
  const line = page.getByRole("checkbox", { name: /Devolver Luva de proteção mecânica/ });
  await expect(line).toBeChecked();
  await expect(page.getByLabel("Motivo da linha 1")).toHaveValue(/13/);
  const submit = page.getByRole("button", { name: /Registrar devolução/ });
  await expect(submit).toBeDisabled();
  await page.getByLabel("Destino da linha 1").selectOption("RESTOCK");
  await page
    .getByLabel("Assinatura presencial do colaborador (observações)")
    .fill("Devolução assinada em papel; arquivo na pasta funcional");
  await submit.click();
  await expect(page).toHaveURL(/\/rh\/fichas\/sheet-2$/);
  const returns = page.locator("section").filter({ has: page.getByRole("heading", { name: "Devoluções" }) });
  await expect(returns).toContainText("Devolução demissional");
  await expect(returns).toContainText("M.D. 13 – Desligamento");
  await expect(returns).toContainText("voltou ao estoque");
  await expect(page.getByRole("link", { name: "Registrar devolução" })).toHaveCount(0);
  // PDF e Excel da ficha com devolução (cópia de impressão).
  for (const button of ["Baixar PDF / imprimir", "Baixar Excel"]) {
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: button }).click();
    expect((await download).suggestedFilename()).toMatch(/^DEMO-ficha-sheet-2\.(pdf|xlsx)$/);
  }
  // A movimentação de devolução aparece no estoque.
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await login(page, "ALMOXARIFADO");
  await page.goto("/almoxarifado/movimentacoes");
  await page.getByLabel("Tipo de movimentação").selectOption("RETURN");
  await expect(page.locator("tbody tr").first()).toContainText("Devolução – M.D. 13");
});
