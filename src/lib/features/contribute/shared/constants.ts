/** Single source of truth for OCR categories and their swatches. */
export const OCR_CATEGORIES = [
  'street',
  'hydrology',
  'place',
  'building',
  'institution',
  'legend',
  'legend_entry',
  'legend_ref',
  'title',
  'other',
] as const;
export type OcrCategory = (typeof OCR_CATEGORIES)[number];

export const CAT_COLORS: Record<string, string> = {
  street: '#ef4444',
  hydrology: '#3b82f6',
  place: '#60a5fa',
  building: '#22c55e',
  institution: '#f97316',
  legend: '#a855f7',
  legend_entry: '#a855f7',
  legend_ref: '#eab308',
  title: '#06b6d4',
  other: '#9ca3af',
};

export const STATUS_COLORS: Record<string, string> = {
  pending: '#ca8a04',
  validated: '#16a34a',
  rejected: '#dc2626',
};
