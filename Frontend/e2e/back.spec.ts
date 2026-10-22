import { test, expect } from "@playwright/test";
test.setTimeout(120000);
async function login(page: any) {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption("RH");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test("voltar preserva o rascunho e permite trocar assinatura após cancelar a revisão pendente", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/nova");
  await page
    .getByRole("button", { name: "Voltar uma etapa", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rh\/fichas$/);
  await page.getByRole("link", { name: "+ Montar ficha", exact: true }).click();
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  await page
    .getByLabel("Data da entrega do item", { exact: false })
    .fill("2026-10-29");
  await page
    .getByRole("button", { name: "← Voltar para colaborador", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /Ana Martins/ })).toHaveClass(
    /selected/,
  );
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await page
    .getByRole("combobox", { name: "Método de assinatura", exact: true })
    .selectOption("ELECTRONIC");
  await page
    .getByRole("button", { name: "← Voltar antes de gerar", exact: true })
    .click();
  await expect(
    page.getByLabel("Data da entrega do item", { exact: false }),
  ).toHaveValue("2026-10-29");
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await expect(
    page.getByRole("combobox", { name: "Método de assinatura", exact: true }),
  ).toHaveValue("ELECTRONIC");
  await page
    .getByRole("button", { name: "Gerar ficha demonstrativa", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "QR Code do link individual de assinatura" }),
  ).toBeVisible();
  const oldId = new URL(page.url()).searchParams.get("ficha")!;
  const oldLink = await page
    .getByLabel("Link de assinatura", { exact: true })
    .inputValue();
  await page
    .getByRole("button", { name: "Alterar método ou dados", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manter revisão atual", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Método de assinatura", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "← Voltar para equipamentos", exact: true })
    .click();
  const confirmation = page.getByRole("region", {
    name: "Confirmar retorno para edição",
    exact: true,
  });
  await expect(confirmation).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "dist/voltar-revisao-mobile.png",
    fullPage: true,
  });
  await confirmation
    .getByRole("button", { name: "Voltar e editar", exact: true })
    .click();
  await expect(page).toHaveURL(/\/rh\/fichas\/nova$/);
  await expect(
    page.getByRole("heading", { name: "Escolha os equipamentos e tamanhos" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Data da entrega do item", { exact: false }),
  ).toHaveValue("2026-10-29");
  const old = await page.evaluate((id) => {
    const d = JSON.parse(localStorage.getItem("epi-demo-v3")!);
    return {
      state: d.states.find((s: any) => s.sheet_id === id),
      sheet: d.sheets.find((s: any) => s.id === id),
    };
  }, oldId);
  expect(old.state.reservation_status).toBe("CANCELLED");
  expect(old.state.signature_status).toBe("PENDING");
  const expired = await page.context().newPage();
  await expired.goto(oldLink);
  await expect(expired.getByRole("alert")).toContainText(
    /inválido|expirado|utilizado|indisponível/,
  );
  await expired.close();
  await page.bringToFront();
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  await page
    .getByRole("combobox", { name: "Método de assinatura", exact: true })
    .selectOption("MANUAL");
  await page
    .getByRole("button", { name: "Gerar ficha demonstrativa", exact: true })
    .click();
  await expect(page).not.toHaveURL(new RegExp(oldId));
  await page
    .getByRole("button", { name: "Avançar para ficha final", exact: true })
    .click();
  await page
    .getByRole("link", { name: "← Voltar à revisão", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Revisar ficha e assinatura" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Método de assinatura", exact: true }),
  ).toHaveValue("MANUAL");
});
test("voltar de ficha assinada permite consultar todas as etapas sem alterar ou cancelar", async ({
  page,
}) => {
  await login(page);
  await page.goto("/rh/fichas/sheet-2");
  await page
    .getByRole("link", { name: "← Voltar à revisão", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Método de assinatura", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Alterar método ou dados", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Voltar uma etapa", exact: true })
    .click();
  for (const card of await page.locator(".equipment-card").all())
    await expect(card).toBeDisabled();
  await page
    .getByRole("button", { name: "Voltar uma etapa", exact: true })
    .click();
  for (const person of await page.locator(".person-option").all())
    await expect(person).toBeDisabled();
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("epi-demo-v3")!).states.find(
      (s: any) => s.sheet_id === "sheet-2",
    ),
  );
  expect(state.signature_status).toBe("SIGNED_ELECTRONIC");
  expect(state.reservation_status).toBe("DELIVERED");
});
