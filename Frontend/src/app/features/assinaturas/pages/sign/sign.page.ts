import { Component, inject, OnInit } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { ThemeToggleComponent } from "../../../../shared/components/theme-toggle.component";
import {
  SIGNATURE_STYLES,
  normalizeSignerName,
} from "../../../../../../../contracts/signature.mjs";
@Component({
  standalone: true,
  imports: [FormsModule, ThemeToggleComponent],
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
  signerName = "";
  signatureStyle = "classic";
  styles = SIGNATURE_STYLES;
  get signatureFont() {
    return this.styles.find((style) => style.id === this.signatureStyle)?.font;
  }
  get validName() {
    return (
      !!this.signerName.trim() &&
      normalizeSignerName(this.signerName) ===
        normalizeSignerName(
          this.previewData?.signerName ??
            this.previewData?.sheet?.snapshot?.employee?.name ??
            "",
        )
    );
  }
  resetConsent() {
    this.accepted = false;
  }
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
        this.previewData = undefined;
        this.accepted = false;
        if (this.s.demo) await this.loadPreview();
      },
      this.s.demo
        ? "Simulação iniciada."
        : "Código enviado ao e-mail previamente verificado.",
    );
  }
  async loadPreview() {
    const preview = await this.s.publicAction(this.token, "preview", {
      code: this.code,
    });
    this.previewData = preview;
    this.accepted = false;
  }
  onCodeChange(code: string) {
    this.code = code;
    if (/^\d{6}$/.test(code) && !this.s.busy()) this.preview();
  }
  preview() {
    void this.s.action(() => this.loadPreview(), "");
  }
  confirm() {
    if (!this.accepted || !this.validName || !this.previewData || this.s.busy())
      return;
    void this.s.action(async () => {
      await this.s.publicAction(this.token, "confirm", {
        code: this.code,
        acceptedTerms: this.accepted,
        signerName: this.signerName.trim().replace(/\s+/g, " "),
        signatureStyle: this.signatureStyle,
        termsVersion: this.previewData.termsVersion,
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
