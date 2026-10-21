import { Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";
@Component({
  selector: "epi-root",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./app.html",
})
export class App {}
