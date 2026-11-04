import { Injectable, signal } from "@angular/core";

type Theme = "light" | "dark";
@Injectable({ providedIn: "root" })
export class ThemeService {
  readonly mode = signal<Theme>(
    document.documentElement.dataset["theme"] === "dark" ? "dark" : "light",
  );
  constructor() {
    this.apply(this.mode());
    window.addEventListener("storage", (event) => {
      if (event.key !== "epi-color-theme") return;
      const mode =
        event.newValue === "dark" || event.newValue === "light"
          ? event.newValue
          : this.systemTheme();
      this.apply(mode);
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      () => {
        try {
          if (!localStorage.getItem("epi-color-theme"))
            this.apply(this.systemTheme());
        } catch {}
      },
    );
  }
  toggle() {
    const next = this.mode() === "dark" ? "light" : "dark";
    this.apply(next);
    try {
      localStorage.setItem("epi-color-theme", next);
    } catch {}
  }
  private systemTheme(): Theme {
    return matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  private apply(mode: Theme) {
    this.mode.set(mode);
    document.documentElement.dataset["theme"] = mode;
    document.documentElement.style.colorScheme = mode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", mode === "dark" ? "#13151b" : "#f8fafc");
  }
}
