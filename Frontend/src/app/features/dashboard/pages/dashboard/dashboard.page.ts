import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { PortalStore } from "../../../../core/services/portal.service";
import { StatusComponent } from "../../../../shared/components/status-badge/status-badge.component";
import { today } from "../../../../core/models/portal.model";
import {
  caAlertLevel,
  caSeverity,
  caSeverityLabel,
  daysUntil,
  CA_ALERT_LEVELS,
  CA_SEVERITIES,
} from "../../../../../../../contracts/ca-alerts.mjs";
import {
  DashboardKind,
  SIZE_LABELS,
  WIDGETS,
  WidgetDef,
  WidgetSize,
  WidgetSlot,
  clearLayout,
  defaultLayout,
  loadLayout,
  moveWidget,
  saveLayout,
  springKeyframes,
} from "./dashboard-layout";

interface Metric {
  label: string;
  value: number;
  caption: string;
}

interface DragState {
  /** Começou num toque longo: o clique ao soltar não deve abrir o link. */
  fromPress: boolean;
  id: string;
  el: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  lifted: boolean;
  /** Onde o widget foi agarrado, relativo ao seu canto, para não "pular" para o centro. */
  grabX: number;
  grabY: number;
  /** Posição do slot atual do widget, em coordenadas de página. */
  originX: number;
  originY: number;
  lastTarget?: string;
  samples: { x: number; y: number; t: number }[];
}

const LONG_PRESS_MS = 450;
const MOVE_SLOP = 8;
const LIFT_SLOP = 3;
const EDGE = 72;

@Component({
  standalone: true,
  imports: [RouterLink, DatePipe, StatusComponent],
  templateUrl: "./dashboard.page.html",
  styleUrl: "./dashboard.page.css",
  host: { "(document:keydown.escape)": "onEscape()" },
})
export class DashboardComponent implements OnDestroy {
  s = inject(PortalStore);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  private cdr = inject(ChangeDetectorRef);
  date = new Date();

  readonly sizeLabels = SIZE_LABELS;
  readonly editing = signal(false);
  readonly announcement = signal("");
  readonly kind = computed<DashboardKind>(() =>
    this.s.data().role === "ALMOXARIFADO" ? "warehouse" : "rh",
  );
  readonly layout = signal<WidgetSlot[]>([]);
  readonly visible = computed(() => this.layout().filter((w) => !w.hidden));
  readonly hidden = computed(() =>
    this.layout()
      .filter((w) => w.hidden)
      .map((w) => this.def(w.id)!),
  );
  private readonly defs = computed(
    () => new Map(WIDGETS[this.kind()].map((d) => [d.id, d])),
  );
  private sheet = viewChild<ElementRef<HTMLDialogElement>>("sheet");

  private drag?: DragState;
  private pressTimer?: ReturnType<typeof setTimeout>;
  private press?: { id: string; x: number; y: number; pointerType: string; pointerId: number };
  /** Toque longo já disparado (toque/caneta): espera o dedo subir para engolir o clique. */
  private firedPress?: number;
  /** Até quando um clique é consequência do gesto, e não uma intenção nova. */
  private suppressUntil = 0;
  private scrollRaf = 0;
  private readonly reducedMotion =
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  constructor() {
    // Já no primeiro desenho, sem piscar o estado vazio; o efeito recarrega se o
    // usuário ou o perfil mudarem.
    this.layout.set(loadLayout(this.s.user(), this.kind()));
    effect(() => {
      const user = this.s.user();
      const kind = this.kind();
      untracked(() => this.layout.set(loadLayout(user, kind)));
    });
    // Um clique depois de um toque longo ou de arrastar não deve abrir links.
    this.host.nativeElement.addEventListener(
      "click",
      (e) => {
        if (performance.now() > this.suppressUntil) return;
        this.suppressUntil = 0;
        e.preventDefault();
        e.stopPropagation();
      },
      true,
    );
  }

  ngOnDestroy() {
    this.endListeners();
    clearTimeout(this.pressTimer);
  }

  // ───────────────────────────── Dados ─────────────────────────────

  get isWarehouse() {
    return this.s.role === "ALMOXARIFADO";
  }
  get title() {
    return this.isWarehouse ? "Dashboard do Almoxarifado" : "Dashboard do RH";
  }
  get metrics(): Record<string, Metric> {
    const d = this.s.data();
    if (this.isWarehouse)
      return {
        "stat-products": {
          label: "Equipamentos",
          value: d.products.filter((p) => p.active).length,
          caption: "Produtos ativos no catálogo",
        },
        "stat-variants": {
          label: "Tamanhos cadastrados",
          value: d.variants.length,
          caption: "Variações dos equipamentos",
        },
        "stat-categories": {
          label: "Categorias",
          value: this.categoryCounts.length,
          caption: "Categorias no catálogo",
        },
        "stat-ca": {
          label: "CAs a vencer ou vencidos",
          value: this.expiring,
          caption: "Atenção nos próximos 30 dias",
        },
      };
    return {
      "stat-employees": {
        label: "Colaboradores ativos",
        value: d.employees.filter((e) => !e.termination_date).length,
        caption: "Na sua organização",
      },
      "stat-sheets": {
        label: "Fichas emitidas",
        value: d.sheets.length,
        caption: "Documentos no histórico",
      },
      "stat-signatures": {
        label: "Assinaturas pendentes",
        value: this.signatureCount("PENDING"),
        caption: "Aguardando assinatura",
      },
      "stat-deliveries": {
        label: "Entregas pendentes",
        value: this.pendingDeliveries.length,
        caption: "Aguardando confirmação física",
      },
    };
  }
  signatureCount(status: string) {
    return this.s
      .data()
      .states.filter(
        (s) =>
          s.signature_status === status && s.reservation_status !== "CANCELLED",
      ).length;
  }
  get pendingDeliveries() {
    return this.s.data().sheets.filter((f) => {
      const state = this.s.state(f.id);
      return (
        state?.receipt_status === "UNCONFIRMED" &&
        state.reservation_status !== "CANCELLED"
      );
    });
  }
  /** C.A. vencidos ou a vencer em 30, 15 e 7 dias, do mais urgente ao menos urgente. */
  get caAlerts() {
    const order = CA_ALERT_LEVELS.map((l) => l.id as string);
    return this.s
      .data()
      .products.filter((p) => p.active)
      .map((p) => ({ product: p, level: caAlertLevel(p.ca_expires_at, today()) }))
      .filter((a) => a.level)
      .map((a) => {
        const days = daysUntil(a.product.ca_expires_at, today());
        const severity = caSeverity(a.level)!;
        return {
          ...a,
          severity,
          days,
          label: `${caSeverityLabel(severity)} · ${
            days < 0 ? "vencido" : days === 0 ? "vence hoje" : `${days} ${days === 1 ? "dia" : "dias"}`
          }`,
        };
      })
      .sort((a, b) => order.indexOf(a.level!) - order.indexOf(b.level!) || a.days - b.days);
  }
  caCount(severity: string) {
    return this.caAlerts.filter((a) => a.severity === severity).length;
  }
  readonly caLevels = CA_SEVERITIES;
  get expiring() {
    return this.caAlerts.length;
  }
  get categoryCounts() {
    return [...new Set(this.s.data().products.map((p) => p.category))].map(
      (name) => ({
        name,
        count: this.s.data().products.filter((p) => p.category === name).length,
      }),
    );
  }
  get bars() {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const key = d.toISOString().slice(0, 10);
      const rows = this.s
        .data()
        .movements.filter((m) => m.created_at.startsWith(key));
      return {
        label: d.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
        }),
        input: rows
          .filter((r) => r.quantity > 0)
          .reduce((n, r) => n + r.quantity, 0),
        output: -rows
          .filter((r) => r.quantity < 0)
          .reduce((n, r) => n + r.quantity, 0),
      };
    });
  }
  get scale() {
    return 100 / Math.max(1, ...this.bars.flatMap((b) => [b.input, b.output]));
  }
  get input() {
    return this.bars.reduce((n, b) => n + b.input, 0);
  }
  get output() {
    return this.bars.reduce((n, b) => n + b.output, 0);
  }

  // ─────────────────────────── Layout ───────────────────────────

  def(id: string): WidgetDef | undefined {
    return this.defs().get(id);
  }
  private commit(next: WidgetSlot[]) {
    this.layout.set(next);
    saveLayout(this.s.user(), this.kind(), next);
  }

  startEditing() {
    if (this.editing()) return;
    this.editing.set(true);
    this.say("Modo de edição. Arraste os widgets ou use as setas para reorganizar.");
  }
  finishEditing() {
    this.cancelDrag();
    this.editing.set(false);
    this.say("Layout salvo.");
  }
  restoreDefault() {
    this.flip(() => {
      clearLayout(this.s.user(), this.kind());
      this.layout.set(defaultLayout(this.kind()));
    });
    this.say("Layout padrão restaurado.");
  }

  setSize(slot: WidgetSlot, size: WidgetSize) {
    if (slot.size === size) return;
    this.flip(() =>
      this.commit(
        this.layout().map((w) => (w.id === slot.id ? { ...w, size } : w)),
      ),
    );
    this.say(`${this.def(slot.id)?.title}: tamanho ${SIZE_LABELS[size].long.toLowerCase()}.`);
  }

  remove(slot: WidgetSlot) {
    const el = this.widgetEl(slot.id);
    const done = () =>
      this.flip(() =>
        this.commit(
          this.layout().map((w) => (w.id === slot.id ? { ...w, hidden: true } : w)),
        ),
      );
    this.say(`${this.def(slot.id)?.title} removido. Use “Adicionar widget” para trazê-lo de volta.`);
    if (!el || this.reducedMotion) return done();
    let finished = false;
    const once = () => {
      if (finished) return;
      finished = true;
      done();
    };
    el.classList.add("is-leaving");
    el.animate(
      [
        { opacity: 1, scale: 1 },
        { opacity: 0, scale: 0.8 },
      ],
      { duration: 160, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    ).finished.then(once, once);
    // Se a página estiver em segundo plano a animação não avança: não trava a remoção.
    setTimeout(once, 260);
  }

  add(def: WidgetDef) {
    const rest = this.layout().filter((w) => w.id !== def.id);
    const slot = this.layout().find((w) => w.id === def.id)!;
    this.flip(() => this.commit([...rest, { ...slot, hidden: false }]));
    this.closeSheet();
    this.say(`${def.title} adicionado ao fim do painel.`);
    const el = this.widgetEl(def.id);
    if (!el) return;
    el.scrollIntoView({ block: "nearest", behavior: this.reducedMotion ? "auto" : "smooth" });
    if (!this.reducedMotion)
      el.animate(
        [
          { opacity: 0, scale: 0.6, filter: "blur(6px)" },
          { opacity: 1, scale: 1, filter: "blur(0)" },
        ],
        { duration: 380, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
      );
  }

  openSheet() {
    this.sheet()?.nativeElement.showModal();
  }
  closeSheet() {
    this.sheet()?.nativeElement.close();
  }
  onSheetClick(e: MouseEvent) {
    // Toque no fundo escurecido fecha a folha.
    if (e.target === this.sheet()?.nativeElement) this.closeSheet();
  }

  onWidgetKeydown(e: KeyboardEvent, slot: WidgetSlot) {
    if (!this.editing() || e.target !== e.currentTarget) return;
    const list = this.visible();
    const i = list.findIndex((w) => w.id === slot.id);
    let target: WidgetSlot | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") target = list[i - 1];
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") target = list[i + 1];
    else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      const next = list[i + 1] ?? list[i - 1];
      this.remove(slot);
      if (next) setTimeout(() => this.widgetEl(next.id)?.focus(), 200);
      return;
    } else return;
    e.preventDefault();
    if (!target) return;
    this.flip(() => this.commit(moveWidget(this.layout(), slot.id, target!.id)));
    this.widgetEl(slot.id)?.focus();
    this.say(`${this.def(slot.id)?.title}: posição ${list.indexOf(target) + 1} de ${list.length}.`);
  }

  onEscape() {
    if (this.sheet()?.nativeElement.open) return;
    if (this.editing()) this.finishEditing();
  }

  private say(text: string) {
    this.announcement.set("");
    setTimeout(() => this.announcement.set(text));
  }

  // ─────────────────────────── Gestos ───────────────────────────

  onPointerDown(e: PointerEvent, slot: WidgetSlot) {
    if (e.button !== 0 || this.drag) return;
    if ((e.target as HTMLElement).closest(".widget-chrome")) return;

    if (!this.editing()) {
      // Toque longo, como na tela inicial do iPhone, entra no modo de edição.
      this.press = {
        id: slot.id,
        x: e.clientX,
        y: e.clientY,
        pointerType: e.pointerType,
        pointerId: e.pointerId,
      };
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => this.longPress(), LONG_PRESS_MS);
      this.listen();
      return;
    }
    e.preventDefault();
    this.beginDrag(slot.id, e.pointerId, e.clientX, e.clientY);
  }

  private longPress() {
    const press = this.press;
    this.press = undefined;
    if (!press) return;
    this.startEditing();
    this.cdr.detectChanges();
    navigator.vibrate?.(10);
    // Com mouse, o mesmo gesto já pode continuar arrastando. No toque, o navegador
    // já é dono do gesto (rolagem), então o próximo toque é que arrasta.
    if (press.pointerType === "mouse")
      this.beginDrag(press.id, press.pointerId, press.x, press.y, true);
    else this.firedPress = press.pointerId;
  }

  private beginDrag(id: string, pointerId: number, x: number, y: number, fromPress = false) {
    const el = this.widgetEl(id);
    if (!el) return;
    this.drag = {
      fromPress,
      id,
      el,
      pointerId,
      startX: x,
      startY: y,
      x,
      y,
      lifted: false,
      grabX: 0,
      grabY: 0,
      originX: 0,
      originY: 0,
      samples: [{ x, y, t: performance.now() }],
    };
    this.listen();
  }

  private lift(d: DragState) {
    // Parte do valor que está na tela agora (pode estar no meio de uma animação).
    const live = d.el.getBoundingClientRect();
    this.cancelFlip(d.el);
    const slot = this.slotRect(d.el);
    d.grabX = d.startX - live.left;
    d.grabY = d.startY - live.top;
    d.originX = slot.left + scrollX;
    d.originY = slot.top + scrollY;
    d.lifted = true;
    d.el.classList.add("is-dragging");
    this.position(d);
  }

  private position(d: DragState) {
    const tx = d.x + scrollX - d.grabX - d.originX;
    const ty = d.y + scrollY - d.grabY - d.originY;
    d.el.style.translate = `${tx}px ${ty}px`;
  }

  private onMove = (e: PointerEvent) => {
    if (this.press && e.pointerId === this.press.pointerId) {
      if (Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > MOVE_SLOP)
        this.cancelPress();
      return;
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    d.x = e.clientX;
    d.y = e.clientY;
    const now = performance.now();
    d.samples.push({ x: d.x, y: d.y, t: now });
    while (d.samples.length > 2 && now - d.samples[0].t > 100) d.samples.shift();
    if (!d.lifted) {
      if (Math.hypot(d.x - d.startX, d.y - d.startY) < LIFT_SLOP) return;
      this.lift(d);
    }
    this.position(d);
    this.hitTest(d);
    this.autoScroll();
  };

  private hitTest(d: DragState) {
    let over: string | undefined;
    for (const w of this.visible()) {
      if (w.id === d.id) continue;
      const r = this.widgetEl(w.id)?.getBoundingClientRect();
      if (r && d.x >= r.left && d.x <= r.right && d.y >= r.top && d.y <= r.bottom) {
        over = w.id;
        break;
      }
    }
    // Só troca de novo com o mesmo widget depois que o ponteiro sair dele: evita
    // o vai-e-volta quando os tamanhos são diferentes.
    if (over === d.lastTarget) return;
    d.lastTarget = over;
    if (!over) return;
    this.flip(() => this.commit(moveWidget(this.layout(), d.id, over!)), d.el);
    const slot = this.slotRect(d.el);
    d.originX = slot.left + scrollX;
    d.originY = slot.top + scrollY;
    this.position(d);
    navigator.vibrate?.(4);
  }

  private onUp = (e: PointerEvent) => {
    if (this.press && e.pointerId === this.press.pointerId) return this.cancelPress();
    if (this.firedPress === e.pointerId) {
      this.firedPress = undefined;
      this.suppressUntil = performance.now() + 400;
      return this.endListeners();
    }
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drop(d, e.type === "pointercancel");
  };

  private drop(d: DragState, cancelled = false) {
    this.drag = undefined;
    this.endListeners();
    if (d.lifted || d.fromPress) this.suppressUntil = performance.now() + 400;
    if (!d.lifted) return;
    const [x, y] = (d.el.style.translate || "0px 0px")
      .split(" ")
      .map((v) => parseFloat(v) || 0);
    d.el.style.translate = "";
    d.el.classList.remove("is-dragging");
    // A velocidade do dedo vira a velocidade inicial da mola: sem costura.
    // Só conta o movimento dos últimos 100 ms: parado antes de soltar = sem impulso.
    const now = performance.now();
    const recent = d.samples.filter((s) => now - s.t <= 100);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = first ? Math.max(16, last.t - first.t) / 1000 : 1;
    const v: [number, number] =
      cancelled || recent.length < 2
        ? [0, 0]
        : [(last.x - first.x) / dt, (last.y - first.y) / dt];
    if (!this.reducedMotion && (Math.abs(x) > 0.5 || Math.abs(y) > 0.5)) {
      const { frames, duration } = springKeyframes([x, y], v, 0.4);
      d.el.animate(frames, { duration, easing: "linear", id: "flip" });
    }
    const list = this.visible();
    const i = list.findIndex((w) => w.id === d.id);
    this.say(`${this.def(d.id)?.title}: posição ${i + 1} de ${list.length}.`);
  }

  private cancelDrag() {
    this.cancelPress();
    if (this.drag) this.drop(this.drag, true);
  }

  private cancelPress() {
    clearTimeout(this.pressTimer);
    this.press = undefined;
    this.firedPress = undefined;
    if (!this.drag) this.endListeners();
  }

  private autoScroll() {
    if (this.scrollRaf) return;
    const tick = () => {
      this.scrollRaf = 0;
      const d = this.drag;
      if (!d?.lifted) return;
      const speed =
        d.y < EDGE ? -(EDGE - d.y) / 3 : d.y > innerHeight - EDGE ? (d.y - (innerHeight - EDGE)) / 3 : 0;
      if (!speed) return;
      scrollBy(0, speed);
      this.position(d);
      this.hitTest(d);
      this.scrollRaf = requestAnimationFrame(tick);
    };
    this.scrollRaf = requestAnimationFrame(tick);
  }

  private preventMenu = (e: Event) => {
    if (this.press || this.drag || this.editing()) e.preventDefault();
  };

  private listening = false;
  private listen() {
    if (this.listening) return;
    this.listening = true;
    addEventListener("pointermove", this.onMove, { passive: false });
    addEventListener("pointerup", this.onUp);
    addEventListener("pointercancel", this.onUp);
    addEventListener("contextmenu", this.preventMenu);
  }
  private endListeners() {
    if (!this.listening) return;
    this.listening = false;
    removeEventListener("pointermove", this.onMove);
    removeEventListener("pointerup", this.onUp);
    removeEventListener("pointercancel", this.onUp);
    removeEventListener("contextmenu", this.preventMenu);
    cancelAnimationFrame(this.scrollRaf);
    this.scrollRaf = 0;
  }

  // ──────────────────────── Animação (FLIP) ────────────────────────

  private widgetEl(id: string) {
    return this.host.nativeElement.querySelector<HTMLElement>(
      `[data-widget="${id}"]`,
    );
  }
  private widgetEls() {
    return [
      ...this.host.nativeElement.querySelectorAll<HTMLElement>("[data-widget]"),
    ];
  }
  private cancelFlip(el: HTMLElement) {
    for (const a of el.getAnimations()) if (a.id === "flip") a.cancel();
  }
  /** Posição do slot no grid, sem o deslocamento do arraste. */
  private slotRect(el: HTMLElement) {
    const t = el.style.translate;
    el.style.translate = "";
    const r = el.getBoundingClientRect();
    el.style.translate = t;
    return r;
  }

  /**
   * Muda o layout e anima os outros widgets da posição em que estavam na tela
   * até o novo lugar, com uma mola. Como parte da posição atual, um gesto pode
   * interromper e redirecionar a animação a qualquer momento.
   */
  private flip(mutate: () => void, skip?: HTMLElement) {
    const before = new Map<string, DOMRect>();
    for (const el of this.widgetEls())
      if (el !== skip) before.set(el.dataset["widget"]!, el.getBoundingClientRect());
    mutate();
    this.cdr.detectChanges();
    if (this.reducedMotion) return;
    for (const el of this.widgetEls()) {
      if (el === skip) continue;
      const prev = before.get(el.dataset["widget"]!);
      if (!prev) continue;
      this.cancelFlip(el);
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      const { frames, duration } = springKeyframes([dx, dy], [0, 0], 0.4);
      el.animate(frames, { duration, easing: "linear", id: "flip" });
    }
  }
}
