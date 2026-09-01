/**
 * The `maps` write payload assembled by MapEditModal's Save button.
 *
 * Kept out of the component so the field list lives in one place instead of a
 * 33-line object literal inside `handleSave`, and so the trimming /
 * `label_config` parsing rules are testable on their own.
 */

/** Raw form state, straight off the tab components' `bind:value`s. */
export interface MapEditForm {
  // About
  name: string;
  original_title: string;
  year: string;
  year_label: string;
  creator: string;
  dc_publisher: string;
  location: string;
  map_type: string;
  dc_coverage: string;
  dc_subject: string;
  dc_description: string;
  physical_description: string;
  language: string;
  extraPairs: { key: string; value: string }[];
  // Source
  source_type: string;
  holding_institution: string;
  collection: string;
  shelfmark: string;
  ia_identifier: string;
  source_url: string;
  rights: string;
  // Hosting / georef
  allmaps_id: string;
  annotation_url: string;
  // Quick bar + pipeline flags. Visibility is `status` alone (mig 060).
  priority: number;
  georef_done: boolean;
  legend_done: boolean;
  help_needed: boolean;
  status: string;
  // Label Studio config (Pipeline tab)
  labelLegendMode: 'simple' | 'list';
  labelLegendText: string;
  labelCategories: string;
}

export interface LabelConfig {
  legend: (string | { val: string; label: string })[];
  categories: string[];
}

/** Column set PATCHed to `/api/admin/maps/[id]`. Mirrors `maps` Update. */
export interface MapEditPayload {
  name: string;
  allmaps_id: string;
  annotation_url?: string;
  location?: string;
  map_type?: string;
  year: number | null;
  dc_description?: string;
  extra_metadata: Record<string, string>;
  source_type?: string;
  collection?: string;
  source_url?: string;
  original_title?: string;
  creator?: string;
  year_label?: string;
  language?: string;
  rights?: string;
  shelfmark?: string;
  physical_description?: string;
  dc_publisher?: string;
  dc_subject?: string;
  dc_coverage?: string;
  holding_institution?: string;
  label_config: LabelConfig;
  priority: number;
  georef_done: boolean;
  legend_done: boolean;
  help_needed: boolean;
  status: string;
  ia_identifier?: string;
}

/** `''` → `undefined` so the API leaves the column alone rather than blanking it. */
const opt = (v: string): string | undefined => v.trim() || undefined;

/**
 * Reads the two `label_config` text inputs back into the stored JSON shape.
 * `simple` = comma-separated strings; `list` = one `value | label` pair per line.
 */
export function parseLabelConfig(
  mode: 'simple' | 'list',
  legendText: string,
  categoriesText: string
): LabelConfig {
  let legend: LabelConfig['legend'] = [];
  if (legendText.trim()) {
    legend =
      mode === 'simple'
        ? legendText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : legendText
            .split('\n')
            .map((line) => {
              const parts = line.split('|');
              if (parts.length >= 2) return { val: parts[0].trim(), label: parts[1].trim() };
              return line.trim();
            })
            .filter(Boolean);
  }
  return {
    legend,
    categories: categoriesText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Serialises the modal's form state into the PATCH body. */
export function toMapEditPayload(form: MapEditForm): MapEditPayload {
  const extra_metadata: Record<string, string> = {};
  for (const { key, value } of form.extraPairs) {
    if (key.trim()) extra_metadata[key.trim()] = value;
  }

  return {
    name: form.name.trim(),
    allmaps_id: form.allmaps_id.trim(),
    annotation_url: opt(form.annotation_url),
    location: opt(form.location),
    map_type: opt(form.map_type),
    year: form.year ? Number(form.year) : null,
    dc_description: opt(form.dc_description),
    extra_metadata,
    source_type: opt(form.source_type),
    collection: opt(form.collection),
    source_url: opt(form.source_url),
    original_title: opt(form.original_title),
    creator: opt(form.creator),
    year_label: opt(form.year_label),
    language: opt(form.language),
    rights: opt(form.rights),
    shelfmark: opt(form.shelfmark),
    physical_description: opt(form.physical_description),
    dc_publisher: opt(form.dc_publisher),
    dc_subject: opt(form.dc_subject),
    dc_coverage: opt(form.dc_coverage),
    holding_institution: opt(form.holding_institution),
    label_config: parseLabelConfig(
      form.labelLegendMode,
      form.labelLegendText,
      form.labelCategories
    ),
    priority: form.priority,
    georef_done: form.georef_done,
    legend_done: form.legend_done,
    help_needed: form.help_needed,
    status: form.status,
    ia_identifier: opt(form.ia_identifier),
  };
}

/** Reads the stored `label_config` JSON back into the two text inputs. */
export function labelConfigToForm(labelConfig: unknown): {
  mode: 'simple' | 'list';
  legendText: string;
  categories: string;
} {
  const cfg = (labelConfig ?? {}) as { legend?: unknown; categories?: unknown };
  const legend: unknown[] = Array.isArray(cfg.legend) ? cfg.legend : [];
  const structured = legend.length > 0 && typeof legend[0] === 'object';
  return {
    mode: structured ? 'list' : 'simple',
    legendText: structured
      ? legend
          .map((l) => {
            const entry = l as { val?: string; label?: string };
            return typeof l === 'string' ? l : `${entry.val} | ${entry.label}`;
          })
          .join('\n')
      : legend.join(', '),
    categories: Array.isArray(cfg.categories) ? cfg.categories.join(', ') : '',
  };
}
