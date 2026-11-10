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
  cpfStart = "";
  cpfEnd = "";
  /** Confirmed by the server (the page never knows the CPF). */
  identityOk = false;
  identityError = "";
  checkingIdentity = false;
  get digitsComplete() {
    return /^\d{3}$/.test(this.cpfStart) && /^\d{3}$/.test(this.cpfEnd);
  }
  get identityReady() {
    return !this.previewData?.identityRequired || this.identityOk;
  }
  /** Any change to name or digits requires a new server check. */
  identityChanged() {
    this.identityOk = false;
    this.identityError = "";
    this.resetConsent();
    if (this.previewData?.identityRequired && this.digitsComplete && this.validName)
      void this.checkIdentity();
  }
  async checkIdentity() {
    if (this.checkingIdentity || !this.digitsComplete || !this.validName) return;
    this.checkingIdentity = true;
    const sent = { name: this.signerName, start: this.cpfStart, end: this.cpfEnd };
    try {
      await this.s.publicAction(this.token, "identity", {
        code: this.code,
        signerName: this.signerName.trim().replace(/\s+/g, " "),
        cpfStart: this.cpfStart,
        cpfEnd: this.cpfEnd,
      });
      // Ignore a late answer if the fields changed meanwhile.
      this.identityOk =
        sent.name === this.signerName && sent.start === this.cpfStart && sent.end === this.cpfEnd;
    } catch (e) {
      this.identityError = e instanceof Error ? e.message : "Não foi possível conferir os dados.";
    } finally {
      this.checkingIdentity = false;
    }
  }
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
    if (
      !this.accepted ||
      !this.validName ||
      !this.identityReady ||
      !this.previewData ||
      this.s.busy()
    )
      return;
    void this.s.action(async () => {
      await this.s.publicAction(this.token, "confirm", {
        code: this.code,
        acceptedTerms: this.accepted,
        signerName: this.signerName.trim().replace(/\s+/g, " "),
        signatureStyle: this.signatureStyle,
        termsVersion: this.previewData.termsVersion,
        ...(this.previewData.identityRequired
          ? { cpfStart: this.cpfStart, cpfEnd: this.cpfEnd }
          : {}),
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
