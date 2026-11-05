import { test, expect } from "@playwright/test";

test("alternar entre teclado e mouse mantém o seletor e o login funcionando", async ({
  page,
}) => {
  await page.goto("/login");
  const profile = page.getByLabel("Explorar como");
  await profile.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("epi-root")).toHaveClass(/keyboard-input/);
  await profile.click();
  await expect(profile).toBeFocused();
  await expect(page.locator("epi-root")).not.toHaveClass(/keyboard-input/);
  await expect
    .poll(() => profile.evaluate((select) => select.matches(":open")))
    .toBe(true);
  await page.keyboard.press("Escape");
  await profile.selectOption("ALMOXARIFADO");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Dashboard do Almoxarifado",
      exact: true,
    }),
  ).toBeVisible();
});

test("cliques próximos à borda selecionam colaborador e equipamento", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByLabel("Explorar como").selectOption("RH");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.goto("/rh/fichas/nova");
  const employee = page.getByRole("button", { name: /Ana Martins/ });
  await employee.click({ position: { x: 1, y: 30 }, delay: 180 });
  await expect(employee).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click({
    position: { x: 1, y: 20 },
    delay: 180,
  });
  await page.getByRole("button", { name: /Bota de segurança em couro/ }).click({
    position: { x: 1, y: 30 },
    delay: 180,
  });
  await expect(
    page.getByRole("button", { name: "Revisar seleção →" }),
  ).toBeEnabled();
});

test("temas seguem o sistema, persistem e cobrem login, ficha, modal e assinatura", async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Ativar modo claro" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "dist/theme-light-login.png", fullPage: true });
  await page.getByLabel("Explorar como").selectOption("RH");
  await page.getByRole("button", { name: "Entrar na demonstração" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(19, 21, 27)",
  );
  await expect(page.locator(".panel").first()).toHaveCSS(
    "background-color",
    "rgb(31, 33, 46)",
  );
  await expect(
    page.getByRole("link", { name: "Dashboard", exact: true }),
  ).toHaveCSS("background-color", "rgb(220, 38, 38)");
  await expect(page.getByRole("link", { name: "Montar nova ficha" })).toHaveCSS(
    "background-color",
    "rgb(37, 99, 235)",
  );
  await expect(page.locator(".stat").first()).toHaveCSS(
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "dist/theme-dark-dashboard.png",
    fullPage: true,
  });
  await page.goto("/rh/fichas/nova");
  await page.getByRole("button", { name: /Ana Martins/ }).click();
  await page.getByRole("button", { name: "Escolher equipamentos →" }).click();
  await page
    .getByRole("button", { name: /Bota de segurança em couro/ })
    .click();
  await expect(page.locator(".equipment-card").first()).toHaveCSS(
    "background-color",
    "rgb(31, 33, 46)",
  );
  await page.getByRole("button", { name: "Revisar seleção →" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", "rgb(31, 33, 46)");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "dist/theme-dark-modal-mobile.png" });
  await dialog.getByRole("button", { name: "Confirmar e avançar →" }).click();
  await page
    .getByText("Método de assinatura", { exact: false })
    .locator("select")
    .selectOption("ELECTRONIC");
  await page.getByRole("button", { name: "Gerar ficha demonstrativa" }).click();
  const link = await page
    .getByLabel("Link de assinatura", { exact: true })
    .inputValue();
  const signer = await context.newPage();
  await signer.goto(link);
  await expect(signer.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(signer.locator(".sign-card")).toHaveCSS(
    "background-color",
    "rgb(31, 33, 46)",
  );
  await signer.screenshot({ path: "dist/theme-dark-sign.png", fullPage: true });
  await signer.getByRole("button", { name: "Ativar modo claro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(signer.locator(".sign-card")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)",
  );
  await page.getByRole("button", { name: "Ativar modo escuro" }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.goto("/relatorios");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.screenshot({
    path: "dist/theme-dark-reports-mobile.png",
    fullPage: true,
  });
});
