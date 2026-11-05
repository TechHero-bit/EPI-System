import {
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  NgZone,
} from "@angular/core";
import { RouterOutlet } from "@angular/router";
@Component({
  selector: "epi-root",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./app.html",
})
export class App {
  constructor() {
    const document = inject(DOCUMENT);
    const host = inject(ElementRef<HTMLElement>).nativeElement;
    const controller = new AbortController();
    inject(DestroyRef).onDestroy(() => controller.abort());
    // Input modality only affects CSS. Avoid checking every page on pointerdown.
    inject(NgZone).runOutsideAngular(() => {
      const options = { passive: true, signal: controller.signal };
      document.addEventListener(
        "keydown",
        () => host.classList.add("keyboard-input"),
        options,
      );
      document.addEventListener(
        "pointerdown",
        () => host.classList.remove("keyboard-input"),
        options,
      );
    });
  }
}
