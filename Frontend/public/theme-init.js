// Apply the saved preference before Angular and the page styles render.
(() => {
  let saved;
  try {
    saved = localStorage.getItem("epi-color-theme");
  } catch {}
  const mode =
    saved === "light" || saved === "dark"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
})();
