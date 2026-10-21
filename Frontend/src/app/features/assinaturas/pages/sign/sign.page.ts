import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
@Component({
  standalone: true,
  imports: [FormsModule],
  templateUrl: "./sign.page.html",
})
export class SignComponent implements OnInit {
  s = inject(PortalStore);
  route = inject(ActivatedRoute);
  token = this.route.snapshot.paramMap.get("token")!;
  sent = false;
  code = "";
  previewData: any;
  accepted = false;
  done = false;
  ngOnInit() {
    void this.s.action(async () => {
      await this.s.init();
      await this.s.publicAction(this.token, "");
    }, "");
  }
  requestCode() {
    void this.s.action(
      async () => {
        await this.s.publicAction(this.token, "code", {});
        this.sent = true;
      },
      this.s.demo
        ? "Simulação iniciada."
        : "Código enviado ao e-mail previamente verificado.",
    );
  }
  preview() {
    void this.s.action(async () => {
      this.previewData = await this.s.publicAction(this.token, "preview", {
        code: this.code,
      });
    }, "");
  }
  confirm() {
    void this.s.action(async () => {
      await this.s.publicAction(this.token, "confirm", {
        code: this.code,
        acceptedTerms: this.accepted,
      });
      this.done = true;
    }, "");
  }
  download() {
    void this.s.action(
      () => this.s.download(this.previewData.sheet.id, "pdf"),
      "",
    );
  }
}
