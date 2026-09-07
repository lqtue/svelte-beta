/**
 * Editorial copy for /about — the six-layer stack, the three-phase roadmap and
 * the audience cards. Pure content: no logic, no imports. Lives here so the
 * page component is markup only.
 */

export interface Layer {
  id: string;
  name: string;
  desc: string;
  pct: number;
  color: string;
  phase: string;
  phaseColor: string;
  built: string[];
  building: string[];
  next: string;
}

export const layers: Layer[] = [
  {
    id: 'L1',
    name: 'Historical maps',
    desc: 'The foundation — old maps placed on real coordinates, and the buildings and names read back off them',
    pct: 22,
    color: 'var(--color-green)',
    phase: 'Foundation',
    phaseColor: 'var(--color-green)',
    built: [
      '39 maps published and georeferenced — 22 of Saigon and Chợ Lớn, 10 of Huế, 7 of Hanoi — spanning 1791 to 1968',
      'Sourced from the Bibliothèque nationale de France (16 sheets), Université Côte d’Azur, UT Austin’s Perry-Castañeda collection, the Library of Congress, Virtual Saigon and private collections. Each record links back to the holder',
      'Every sheet opens in an ordinary browser, laid over the modern city — no specialist software, just a link',
      'A first OCR pass has read about 950 distinct place names off six of those sheets, and each one links back to the exact spot on the exact sheet it came from',
      'A tracing tool anyone with an account can use, and 46 shapes traced with it so far — all on the 1882 cadastral survey',
      'An early segmentation test pulled 91 city blocks out of the 1882 survey with no training examples at all. A promising result on one sheet, not a finished pipeline',
    ],
    building: [
      'Running the OCR pass across the rest of the georeferenced sheets — six of 39 have been through it',
      'Checking what the OCR read: 43 names confirmed by a person so far, so this queue has barely started, and until it moves the label search stays thin',
      'The footprint review queue. None of the 46 traced shapes is approved yet, so nothing has been released as a dataset',
    ],
    next: 'One complete sheet, end to end — every building and name on the 1882 cadastral, checked by a person and published openly',
  },
  {
    id: 'L2',
    name: 'Building heights',
    desc: 'How tall was the city? The plan is to read it from two rare painted views rather than laser scans',
    pct: 3,
    color: 'var(--color-blue)',
    phase: 'Phase 3',
    phaseColor: 'var(--color-purple)',
    built: [
      'Source research, and so far only that: two painting-and-map pairs from the same years as our maps, which is more than most reconstruction projects start with',
      'An 1881 bird’s-eye engraving showing the whole city from above — floors countable, rooflines visible, block heights comparable across the grid',
      'A 1901 painted view of the same city in colour, where the colour also says what the roofs are made of',
      'An open-source 3D reconstruction method (TU Delft, 2021), proven on Dutch and Belgian cities, read and assessed as the likely starting point. Nothing has been built with it yet',
    ],
    building: [
      'Nothing running. This layer cannot begin until L1 produces reviewed footprints to give heights to',
    ],
    next: 'A first height estimate, each with a confidence score, for the buildings on one reviewed sheet',
  },
  {
    id: 'L3',
    name: 'Roof types',
    desc: 'Flat, pitched or hipped — a roofline for each building',
    pct: 2,
    color: 'var(--color-blue)',
    phase: 'Phase 3',
    phaseColor: 'var(--color-purple)',
    built: [
      'One useful observation from the 1901 painted view: the city reads as almost uniformly red-tiled, the same terracotta still common in Vietnamese cities today',
      'That is a hint the colour-coded map symbols track real building types rather than drafting convention — a hypothesis worth testing, not something we have tested',
      'A draft rule set for buildings with no surviving photograph (shophouse → flat, colonial administrative → hipped, church → tower), sanity-checked against landmarks whose heights are known, such as Notre-Dame at 57 m',
    ],
    building: ['Nothing running. Waits on L2'],
    next: 'A typed roof per building, each carrying how much evidence stands behind it',
  },
  {
    id: 'L4',
    name: 'Detailed 3D models',
    desc: 'Photo-realistic facades for a handful of landmarks, built from archival photographs',
    pct: 2,
    color: 'var(--color-blue)',
    phase: 'Phase 3',
    phaseColor: 'var(--color-purple)',
    built: [
      'A technique picked — open-source photogrammetry, proven on architectural heritage elsewhere. Not yet run on anything of ours',
      'A survey of where the photographs are: French colonial survey albums, BnF postcards from 1900–1930, the Manhhai community archive, family collections',
      'An “adopt a building” volunteer role sketched out — you find the photographs, the computer builds the model, your name stays on it. Nobody has adopted one yet',
    ],
    building: [
      'Gathering archival photographs for a first five buildings: Notre-Dame, City Hall, the Opera House, the Central Post Office, Bến Thành market',
    ],
    next: 'One landmark shown as a full textured model, with every photograph’s contributor named',
  },
  {
    id: 'L5',
    name: 'Stories behind the buildings',
    desc: 'Names, owners, dates and histories, linked to the geometry',
    pct: 5,
    color: 'var(--color-orange)',
    phase: 'Phase 2',
    phaseColor: 'var(--color-blue)',
    built: [
      'A place-time index in the database: every extracted label and shape carries a real-world position, a record of which georeference produced it, and that map’s own error in metres — so “what was here in 1923” is one query rather than a re-computation',
      'A gazetteer page for each attested place name, grouping the spellings the sheets themselves used',
    ],
    building: [
      'Nothing on the history side. There is no buildings-and-people database, no relationship model and no historian tool yet — those exist as a design, not as software',
    ],
    next: 'A first 100 entries with citations, once there are reviewed footprints to attach them to',
  },
  {
    id: 'L6',
    name: 'Living memory',
    desc: 'A page for every building that anyone can add to — the part that needs people rather than code',
    pct: 10,
    color: 'var(--color-purple)',
    phase: 'Phase 1',
    phaseColor: 'var(--color-green)',
    built: [
      'GPS walking stories: stand near a historic site and the app shows what was there. The tool works; one story has been written with it so far',
      'An annotation tool for drawing and labelling on any map in the archive',
      'A public georeferencing page, so anyone can help anchor a sheet that has not been placed',
    ],
    building: [
      'Finding people. This layer is a community problem rather than an engineering one, and the community is currently very small',
    ],
    next: 'A discussion page for each building — but only once there are reviewed buildings in the archive to discuss',
  },
];

export const phases = [
  {
    num: 1,
    title: 'Maps to Geometry',
    subtitle: '"Turn every building on colonial maps into a shape with an address"',
    timeline: '6–9 months from funding',
    color: 'var(--color-green)',
    milestones: [
      {
        id: 'M1.1',
        text: '10 colonial Saigon maps placed and linked — spanning 1880 to 1930',
        done: false,
      },
      {
        id: 'M1.2',
        text: 'Community tracing tools live: trace building outlines and check what the OCR read',
        done: true,
      },
      {
        id: 'M1.3',
        text: 'AI building detector improved on community-traced examples',
        done: false,
      },
      {
        id: 'M1.4',
        text: 'First open dataset: every building outline in 1900 Saigon',
        done: false,
      },
      { id: 'M1.5', text: 'Dataset covers 5 time periods from 1880 to 1930', done: false },
    ],
  },
  {
    num: 2,
    title: 'Geometry to Knowledge',
    subtitle: '"Give every building a story, every street a history"',
    timeline: '9–18 months from funding',
    color: 'var(--color-blue)',
    milestones: [
      {
        id: 'M2.1',
        text: 'History database live — find any building and see what we know about it',
        done: false,
      },
      {
        id: 'M2.2',
        text: '100 buildings documented with sources: who built them, who owned them, what happened to them',
        done: false,
      },
      {
        id: 'M2.3',
        text: 'Uncertain dates handled honestly — every fact shows how confident we are',
        done: false,
      },
      {
        id: 'M2.4',
        text: 'Research library: 50+ primary sources (maps, surveys, land records) linked to specific buildings',
        done: false,
      },
      {
        id: 'M2.5',
        text: 'All data publicly downloadable — open for researchers, students, journalists',
        done: false,
      },
    ],
  },
  {
    num: 3,
    title: 'Knowledge to Dimension',
    subtitle: '"Lift the city off the page"',
    timeline: '18–30 months from funding',
    color: 'var(--color-purple)',
    milestones: [
      {
        id: 'M3.1',
        text: '3D reconstruction tool adapted to French colonial Saigon maps',
        done: false,
      },
      {
        id: 'M3.2',
        text: 'Color and symbol recognition validated across 3 different Saigon map editions',
        done: false,
      },
      {
        id: 'M3.3',
        text: '3D city model for the 1900 Saigon core — every building as a block with a roof',
        done: false,
      },
      {
        id: 'M3.5',
        text: '"Adopt a building" live — volunteers collect archival photos, earn permanent credit',
        done: false,
      },
      {
        id: 'M3.6',
        text: '10 landmark buildings rebuilt in full detail from historical photos',
        done: false,
      },
      {
        id: 'M3.7',
        text: 'Timeline viewer: scrub through the city at 1890, 1910, and 1930',
        done: false,
      },
    ],
  },
];

export const users = [
  {
    title: 'People living in the city',
    desc: 'You walk past these buildings every day. Find out who built them, who owned them, what was torn down to put them there — and watch the street you know change across a century.',
    uses: 'Now: browse 39 georeferenced maps, overlay them on today, walk a GPS story',
  },
  {
    title: 'Families with roots here',
    desc: "Your grandparents' neighbourhood existed, and the street where they lived had a name before it was renamed. Finding that street on a colonial sheet works today. Attaching a photograph or a memory to it is designed but not built.",
    uses: 'Now: find a street on a colonial sheet. Planned: attach a photo or a memory to a place',
  },
  {
    title: 'Researchers & historians',
    desc: 'Georeferenced maps you can cite and embed, each linked to the institution that holds the scan. The structured, downloadable dataset behind them — land tenure, morphology, administrative records — is the goal, not yet the state.',
    uses: 'Now: embed a georeferenced map, cite a sheet and its holder. Planned: open dataset downloads',
  },
  {
    title: 'OSM & GIS mappers',
    desc: 'Same skills you already use — polygon tracing on a georeferenced base, open data values, community validation. Vietnam’s historical cities need the attention OpenStreetMap gives the modern ones, and right now they have almost none.',
    uses: 'Now: trace footprints, check OCR labels. Planned: GeoJSON export once a sheet is reviewed',
  },
  {
    title: 'Educators',
    desc: 'Interactive maps you can walk through and GPS stories you can assign, usable today for teaching Vietnamese history, colonial urbanism, or heritage and memory. The sourced dataset to cite alongside them is still being built.',
    uses: 'Now: embed a map in a lesson, assign a GPS walk. Planned: structured timeline data',
  },
  {
    title: 'Archives & institutions',
    desc: 'Your digitised maps used and kept accessible rather than downloaded and forgotten, with your institution credited on every record. Sheets from BnF Gallica, Université Côte d’Azur, UT Austin and the Library of Congress are already in the archive; none of it is a formal partnership yet.',
    uses: 'Now: your sheets georeferenced and credited to you on every record',
  },
];
