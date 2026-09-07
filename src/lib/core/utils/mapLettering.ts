/**
 * mapLettering.ts — the lettering conventions of a printed map, as CSS classes.
 *
 * A survey sheet tells you what kind of thing a name refers to through the type
 * itself, not through colour: hydronyms are set in italic, areas and quarters
 * in letterspaced capitals, and streets, buildings and institutions in roman.
 * That is a real system with real information in it, and the archive already
 * stores the distinction — `ocr_extractions.category`, the same values
 * `GAZETTEER_CATEGORIES` groups by. So a label on screen can be set the way
 * the sheet it was read from set it.
 *
 * Roman deliberately returns no class: it is the unmarked case, and an empty
 * rule in the stylesheet would only invite someone to put something in it.
 */
export type LetteringRole = 'hydronym' | 'area' | 'roman';

export function letteringRole(category: string | null | undefined): LetteringRole {
  switch (category) {
    case 'hydrology':
      return 'hydronym';
    case 'place':
      return 'area';
    default:
      return 'roman';
  }
}

/** The class to put on the element that holds the label text. */
export function letteringClass(category: string | null | undefined): string {
  const role = letteringRole(category);
  return role === 'roman' ? '' : `lettering-${role}`;
}
