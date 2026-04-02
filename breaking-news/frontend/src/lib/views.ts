/**
 * Dashboard View system — lets users configure which columns are visible,
 * their order, widths, and active filters, then save/load named "views".
 * Persisted to localStorage per-user (keyed by user ID when available).
 */

// ─── Column Definitions ────────────────────────────────────────────────────

export interface ColumnConfig {
  /** Unique column identifier (matches TanStack column id) */
  id: string;
  /** Human-readable label */
  label: string;
  /** Whether the column is visible */
  visible: boolean;
  /** Column width in pixels */
  width: number;
  /** Default width for reset */
  defaultWidth: number;
  /** Minimum width */
  minWidth: number;
}

/** All available columns with their defaults */
export const ALL_COLUMNS: Omit<ColumnConfig, "visible">[] = [
  { id: "rank", label: "#", width: 40, defaultWidth: 40, minWidth: 32 },
  { id: "famous", label: "", width: 32, defaultWidth: 32, minWidth: 28 },
  { id: "verified", label: "", width: 32, defaultWidth: 32, minWidth: 28 },
  { id: "status", label: "Status", width: 90, defaultWidth: 90, minWidth: 70 },
  { id: "title", label: "Title", width: 400, defaultWidth: 400, minWidth: 200 },
  { id: "category", label: "Category", width: 100, defaultWidth: 100, minWidth: 70 },
  { id: "location", label: "Location", width: 120, defaultWidth: 120, minWidth: 70 },
  { id: "breaking_score", label: "Breaking", width: 90, defaultWidth: 90, minWidth: 60 },
  { id: "trending_score", label: "Trending", width: 90, defaultWidth: 90, minWidth: 60 },
  { id: "trend", label: "Trend", width: 90, defaultWidth: 90, minWidth: 60 },
  { id: "source_count", label: "Sources", width: 70, defaultWidth: 70, minWidth: 50 },
  { id: "coverage", label: "Covered", width: 70, defaultWidth: 70, minWidth: 50 },
  { id: "first_seen", label: "First Seen", width: 100, defaultWidth: 100, minWidth: 70 },
  { id: "last_updated", label: "Updated", width: 100, defaultWidth: 100, minWidth: 70 },
];

// ─── Saved Filter State ────────────────────────────────────────────────────

export interface SavedFilters {
  q?: string;
  nlpPrompt?: string; // Natural language query — parsed server-side into structured filters
  categories?: string[];
  statuses?: string[];
  sourceIds?: string[];
  marketIds?: string[];
  timeRange?: string;
  minScore?: number;
  uncoveredOnly?: boolean;
  trend?: "all" | "rising" | "declining";
}

// ─── Dashboard View ────────────────────────────────────────────────────────

export interface DashboardView {
  id: string;
  name: string;
  /** Column configs in display order */
  columns: ColumnConfig[];
  /** Saved filter presets */
  filters: SavedFilters;
  /** When the view was created */
  createdAt: string;
  /** When the view was last modified */
  updatedAt: string;
}

// ─── Default Views ─────────────────────────────────────────────────────────

function makeColumns(
  visibleIds: string[],
  widthOverrides: Record<string, number> = {}
): ColumnConfig[] {
  // Start with visible columns in the specified order, then add hidden ones
  const ordered: ColumnConfig[] = [];
  for (const id of visibleIds) {
    const col = ALL_COLUMNS.find((c) => c.id === id);
    if (col) {
      ordered.push({
        ...col,
        visible: true,
        width: widthOverrides[id] ?? col.width,
      });
    }
  }
  // Append remaining columns as hidden
  for (const col of ALL_COLUMNS) {
    if (!visibleIds.includes(col.id)) {
      ordered.push({ ...col, visible: false });
    }
  }
  return ordered;
}

export function createDefaultView(): DashboardView {
  const now = new Date().toISOString();
  return {
    id: "default",
    name: "Default",
    columns: makeColumns(ALL_COLUMNS.map((c) => c.id)),
    filters: { timeRange: "24h" },
    createdAt: now,
    updatedAt: now,
  };
}

export const PRESET_VIEWS: DashboardView[] = [
  createDefaultView(),
  {
    id: "breaking-compact",
    name: "Breaking Compact",
    columns: makeColumns(
      ["rank", "status", "title", "breaking_score", "source_count", "first_seen"],
      { title: 400 }
    ),
    filters: {
      statuses: ["ALERT", "BREAKING"],
      timeRange: "6h",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "coverage-gaps",
    name: "Coverage Gaps",
    columns: makeColumns(
      ["rank", "title", "category", "coverage", "breaking_score", "source_count", "first_seen"],
      { title: 360 }
    ),
    filters: {
      uncoveredOnly: true,
      timeRange: "24h",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "trending-focus",
    name: "Trending Focus",
    columns: makeColumns(
      ["rank", "title", "trending_score", "trend", "source_count", "category", "last_updated"],
      { title: 360 }
    ),
    filters: {
      trend: "rising",
      timeRange: "24h",
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ─── Persistence ───────────────────────────────────────────────────────────

const STORAGE_KEY = "bn_dashboard_views";
const ACTIVE_VIEW_KEY = "bn_active_view_id";

export function loadViews(): DashboardView[] {
  if (typeof window === "undefined") return PRESET_VIEWS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return PRESET_VIEWS;
    const parsed = JSON.parse(raw) as DashboardView[];
    return parsed.length > 0 ? parsed : PRESET_VIEWS;
  } catch {
    return PRESET_VIEWS;
  }
}

export function saveViews(views: DashboardView[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function loadActiveViewId(): string {
  if (typeof window === "undefined") return "default";
  return localStorage.getItem(ACTIVE_VIEW_KEY) || "default";
}

export function saveActiveViewId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_VIEW_KEY, id);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

let viewCounter = 0;

export function generateViewId(): string {
  viewCounter++;
  return `view-${Date.now()}-${viewCounter}`;
}

export function duplicateView(
  source: DashboardView,
  newName: string
): DashboardView {
  const now = new Date().toISOString();
  return {
    ...source,
    id: generateViewId(),
    name: newName,
    columns: source.columns.map((c) => ({ ...c })),
    filters: { ...source.filters },
    createdAt: now,
    updatedAt: now,
  };
}
