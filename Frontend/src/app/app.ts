import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
@Component({
  selector: "epi-root",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./app.html",
  host: {
    "[class.keyboard-input]": "keyboardInput",
    "(document:keydown)": "setKeyboardInput(true)",
    "(document:pointerdown)": "setKeyboardInput(false)",
  },
})
export class App {
  keyboardInput = false;

  setKeyboardInput(active: boolean): void {
    this.keyboardInput = active;
  }
}
