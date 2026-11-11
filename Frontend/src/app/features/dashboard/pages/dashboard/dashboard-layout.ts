/**
 * Layout personalizável do dashboard: quais widgets aparecem, em que ordem e
 * em que tamanho. Cada usuário guarda o seu layout neste navegador.
 */
export type WidgetSize = "small" | "medium" | "large";
export type DashboardKind = "rh" | "warehouse";

export interface WidgetDef {
  id: string;
  title: string;
  description: string;
  sizes: readonly WidgetSize[];
  size: WidgetSize;
}

export interface WidgetSlot {
  id: string;
  size: WidgetSize;
  hidden: boolean;
}

export const SIZE_LABELS: Record<WidgetSize, { short: string; long: string }> = {
  small: { short: "P", long: "Pequeno" },
  medium: { short: "M", long: "Médio" },
  large: { short: "G", long: "Grande" },
};

const STAT = ["small", "medium"] as const;
const PANEL = ["medium", "large"] as const;

const CA_VALIDITY: WidgetDef = {
  id: "ca-validity",
  title: "Validade dos C.A.",
  description: "C.A. vencidos ou a vencer em 30, 15 e 7 dias.",
  sizes: PANEL,
  size: "medium",
};

export const WIDGETS: Record<DashboardKind, readonly WidgetDef[]> = {
  rh: [
    { id: "stat-employees", title: "Colaboradores ativos", description: "Total de colaboradores sem desligamento.", sizes: STAT, size: "small" },
    { id: "stat-sheets", title: "Fichas emitidas", description: "Documentos no histórico.", sizes: STAT, size: "small" },
    { id: "stat-signatures", title: "Assinaturas pendentes", description: "Fichas aguardando assinatura.", sizes: STAT, size: "small" },
    { id: "stat-deliveries", title: "Entregas pendentes", description: "Entregas aguardando confirmação física.", sizes: STAT, size: "small" },
    { id: "recent-sheets", title: "Fichas recentes", description: "As últimas fichas emitidas e o status da assinatura.", sizes: PANEL, size: "medium" },
    CA_VALIDITY,
    { id: "pending-deliveries", title: "Entregas a confirmar", description: "Fichas com evidência de entrega a conferir.", sizes: PANEL, size: "medium" },
    { id: "signature-status", title: "Status das assinaturas", description: "Pendentes, presenciais e eletrônicas.", sizes: PANEL, size: "medium" },
  ],
  warehouse: [
    { id: "stat-products", title: "Equipamentos", description: "Produtos ativos no catálogo.", sizes: STAT, size: "small" },
    { id: "stat-variants", title: "Tamanhos cadastrados", description: "Variações dos equipamentos.", sizes: STAT, size: "small" },
    { id: "stat-categories", title: "Categorias", description: "Categorias no catálogo.", sizes: STAT, size: "small" },
    { id: "stat-ca", title: "CAs a vencer ou vencidos", description: "Atenção nos próximos 30 dias.", sizes: STAT, size: "small" },
    { id: "movements-chart", title: "Entradas e saídas", description: "Gráfico dos últimos 7 dias.", sizes: PANEL, size: "medium" },
    CA_VALIDITY,
    { id: "categories", title: "Equipamentos por categoria", description: "Quantidade de equipamentos em cada categoria.", sizes: PANEL, size: "medium" },
    { id: "recent-movements", title: "Movimentações recentes", description: "As últimas entradas e saídas registradas.", sizes: PANEL, size: "medium" },
  ],
};

export function defaultLayout(kind: DashboardKind): WidgetSlot[] {
  return WIDGETS[kind].map((w) => ({ id: w.id, size: w.size, hidden: false }));
}

/** Aceita qualquer coisa salva e devolve um layout válido para a versão atual. */
export function normalizeLayout(kind: DashboardKind, saved: unknown): WidgetSlot[] {
  const defs = new Map(WIDGETS[kind].map((w) => [w.id, w]));
  const out: WidgetSlot[] = [];
  if (Array.isArray(saved)) {
    for (const item of saved) {
      const def = defs.get(item?.id);
      if (!def || out.some((w) => w.id === def.id)) continue;
      out.push({
        id: def.id,
        size: def.sizes.includes(item.size) ? item.size : def.size,
        hidden: item.hidden === true,
      });
    }
  }
  // Widgets novos (ainda não salvos) entram visíveis no fim.
  for (const def of defs.values())
    if (!out.some((w) => w.id === def.id))
      out.push({ id: def.id, size: def.size, hidden: false });
  return out;
}

const storageKey = (user: string, kind: DashboardKind) =>
  `epi-dashboard-layout-v1:${user || "anon"}:${kind}`;

export function loadLayout(user: string, kind: DashboardKind): WidgetSlot[] {
  try {
    const raw = localStorage.getItem(storageKey(user, kind));
    if (raw) return normalizeLayout(kind, JSON.parse(raw));
  } catch {
    /* armazenamento indisponível ou corrompido: usa o padrão */
  }
  return defaultLayout(kind);
}

export function saveLayout(user: string, kind: DashboardKind, layout: WidgetSlot[]) {
  try {
    localStorage.setItem(storageKey(user, kind), JSON.stringify(layout));
  } catch {
    /* sem armazenamento: o layout vale só nesta visita */
  }
}

export function clearLayout(user: string, kind: DashboardKind) {
  try {
    localStorage.removeItem(storageKey(user, kind));
  } catch {
    /* nada a limpar */
  }
}

/** Move `id` para a posição de `targetId` (antes dele ao subir, depois ao descer). */
export function moveWidget(layout: WidgetSlot[], id: string, targetId: string) {
  const from = layout.findIndex((w) => w.id === id);
  const to = layout.findIndex((w) => w.id === targetId);
  if (from < 0 || to < 0 || from === to) return layout;
  const next = [...layout];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/**
 * Mola criticamente amortecida (damping 1.0) por eixo, amostrada em keyframes
 * para a Web Animations API. Parte do deslocamento atual (`from`, em px a partir
 * do destino) e herda a velocidade do gesto (px/s), sem costura entre arrastar e
 * assentar.
 */
export function springKeyframes(
  from: [number, number],
  velocity: [number, number] = [0, 0],
  response = 0.4,
): { frames: Keyframe[]; duration: number } {
  const w = (2 * Math.PI) / response;
  const at = (d0: number, v0: number, t: number) =>
    (d0 + (v0 + w * d0) * t) * Math.exp(-w * t);
  const step = 1 / 60;
  const samples: [number, number][] = [];
  let settled = 0;
  for (let t = 0; t <= 1.5; t += step) {
    const x = at(from[0], velocity[0], t);
    const y = at(from[1], velocity[1], t);
    samples.push([x, y]);
    if (Math.abs(x) > 0.3 || Math.abs(y) > 0.3) settled = samples.length;
  }
  const count = Math.max(2, settled + 1);
  const frames: Keyframe[] = samples.slice(0, count).map(([x, y], i) => ({
    translate: `${x}px ${y}px`,
    offset: i / (count - 1),
  }));
  frames[frames.length - 1] = { translate: "0px 0px", offset: 1 };
  return { frames, duration: (count - 1) * step * 1000 };
}
