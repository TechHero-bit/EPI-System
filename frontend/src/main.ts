import { bootstrapApplication } from "@angular/platform-browser";
import { Component } from "@angular/core";
import { provideRouter, RouterOutlet } from "@angular/router";
import { routes } from "./app/app.routes";

@Component({
  selector: "epi-root",
  standalone: true,
  imports: [RouterOutlet],
  template: "<router-outlet/>",
})
class RootComponent {}
bootstrapApplication(RootComponent, {
  providers: [provideRouter(routes)],
}).catch(console.error);
