import { INK } from '$lib/core/ink';

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
  street: INK.red,
  hydrology: INK.blue,
  place: INK.teal,
  building: INK.green,
  institution: INK.orange,
  legend: INK.purple,
  legend_entry: INK.purple,
  legend_ref: INK.yellow,
  title: INK.plum,
  other: INK.grey,
};

export const STATUS_COLORS: Record<string, string> = {
  pending: INK.yellow,
  validated: INK.green,
  rejected: INK.red,
};
