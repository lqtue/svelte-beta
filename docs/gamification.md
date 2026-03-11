# VMA Gamification Design
_Community engagement through contribution mechanics_

---

## The Core Idea

The city disappears into the past. You bring it back. One building at a time.

When a building you contributed gets rendered in the 3D city, you receive a notification:
> *"Số 5 Rue Catinat just appeared in 1910 Saigon. You helped build it."*

Your name is permanently attributed in the KG entity. In 50 years, people will know you helped reconstruct this city.

---

## Contribution Tiers (Skill Ladder)

Four tiers, each unlocking the next. Anyone can start at L1. Experts self-select upward.

```
L4 · HISTORIAN        KG entities, citations, relations
L3 · ARCHITECT        3D mesh processing, building adoption
L2 · CARTOGRAPHER     Building footprint tracing, validation
L1 · PHOTO HUNTER     Find & tag historical photos by location
```

Each tier has its own leaderboard, badges, and visual presence in the city.

---

## Tier 1 — Photo Hunter
_"Find the city before it vanishes"_

**Task:** Browse EFEO, BnF Gallica, Manhhai collection, family archives. Tag each historical photo to a location on the map. Assess angle coverage.

**Why this works for community:** Zero technical barrier. A Vietnamese diaspora member in California who recognizes their grandmother's street can contribute immediately. Mobile-friendly.

**Points:**
| Action | Points |
|---|---|
| Tag a photo to a street address | 10 |
| Tag a photo to a specific building (KG entity) | 25 |
| Upload a private family photo | 50 |
| Complete a photo set (≥5 angles, same building) | 150 |
| Daily streak bonus | 5/day |

**Badges:**
- 🔍 *Street Detective* — 10 photos tagged
- 📸 *Colonial Lens* — 50 photos tagged
- 🏆 *EFEO Explorer* — 200 photos tagged
- 👨‍👩‍👧 *Family Archive* — first private upload

**Mission mechanic:**
> **Mission: Rue Catinat 1905–1915**
> Find 20 photos of Rue Catinat between 1905 and 1915 from different angles.
> Progress: ████████░░░░ 14/20
> Reward: your name on the street plaque in the 3D model when it renders.

---

## Tier 2 — Cartographer
_"Draw the city back into existence"_

**Task:** Trace building footprints on georeferenced historical maps. Validate other contributors' traces. The core HITL vectorization loop.

**Why this works:** Direct, visible progress. Each traced building fills a gap on the district completion map. You can see the city assembling in real time.

**Points:**
| Action | Points |
|---|---|
| Trace a building footprint | 25 |
| Validate another tracer's footprint (agree) | 5 |
| Flag a footprint as incorrect (with reason) | 10 |
| Complete a full city block | 200 bonus |
| Complete a district | 1,000 bonus |

**Badges:**
- ✏️ *First Stroke* — first building traced
- 🗺️ *Block Captain* — first to complete a city block
- 🏘️ *District Builder* — complete a full district
- ⚡ *Speed Tracer* — 20 buildings in one session

**District completion map:**
The city is divided into ~30 districts. Each shows a % completion bar. Colours shift from dark (untraced) to bright (complete) as buildings are traced. Diaspora communities naturally rally around their ancestral districts — Cholon for Vietnamese-Chinese community, central Saigon for French heritage communities, etc.

---

## Tier 3 — Architect
_"Raise the city off the page"_

**Task:** "Adopt a building" — take ownership of producing its 3D model. Ranges from simple photo texture projection (any volunteer) to full SfM mesh processing (photogrammetry specialists).

**The adoption mechanic:**
- Any contributor can claim an un-adopted building in the KG
- Claimed buildings show "under construction" status in the 3D viewer
- When the model is validated, it renders — and your name appears as a permanent attribution

**Photogrammetry missions:**
> **Mission: Notre Dame Cathedral — 3D Reconstruction**
> Status: 8 photos collected (need 15+ for SfM)
> Angles covered: front ✅ south ✅ north ❌ east ❌ aerial ❌
> Contribute: find photos for missing angles → unlock SfM processing

When complete, the building visually "rises" from the flat map into a textured 3D model for all users. Contributors get a reveal notification.

**Points:**
| Action | Points |
|---|---|
| Adopt a building | 0 (commitment, not points) |
| Submit a photo-texture projection | 100 |
| Complete a photo set for SfM | 200 |
| Successfully validated SfM mesh | 500 |
| Contribute to a landmark mission (>5 photos) | 250 |

**Badges:**
- 🏗️ *Groundbreaker* — first building adopted
- 🏛️ *Landmark Keeper* — contribute to a landmark building (Notre Dame, City Hall, etc.)
- 🔭 *SfM Pioneer* — first successful photogrammetry mesh
- 🌆 *District Architect* — all landmarks in a district modelled

**Visual reveal:**
When a building's model is accepted, it appears in the 3D timeline viewer with a brief animation — rising from a flat footprint into a rendered structure. Contributors get a shareable moment: "I helped rebuild Saigon's Central Post Office."

---

## Tier 4 — Historian
_"Give the city its memory back"_

**Task:** Add entities, relations, and sources to the Knowledge Graph. Every building needs a history — who built it, who owned it, what happened there, what it was called under each regime.

**Why this works:** Research-minded volunteers, academics, Vietnamese history enthusiasts. The KG is where the Public Policy lens lives — political economy, social history, colonial administration.

**Points:**
| Action | Points |
|---|---|
| Add a KG entity with citation | 50 |
| Add a KG relation with source | 30 |
| Correct an erroneous entry (with evidence) | 75 |
| Transcribe a French colonial document | 100 |
| Add a family history connection | 150 |
| Contribute to a verified research chain (3+ linked entities) | 300 |

**Badges:**
- 📖 *Archivist* — 10 KG entries
- 🔗 *Connective Tissue* — 50 relations added
- 🗄️ *Colonial Decoder* — 10 French document transcriptions
- 👁️ *Street Witness* — first oral history contributed
- 🌳 *Family Tree* — connect a living family to a KG building

---

## Leaderboard System

### Three leaderboard types

**1. Global leaderboard**
All-time and weekly reset. Weekly reset means newcomers can compete and win — important for retention.

**2. District leaderboard**
Who has contributed most to each of the ~30 districts. Creates territorial ownership — communities rally around "their" district.

**3. Team leaderboard**
Community groups compete collectively:
- Vietnamese diaspora groups (US, France, Australia)
- University groups (students doing coursework)
- Professional groups (architects, historians, GIS specialists)
- Geographic communities (people from Cholon, people from District 1)

Teams share points from all members. A team claiming a district can "name" a street or building — a small act of ownership that creates deep motivation.

### Points visibility

Every map entity (building, street, district) shows:
- Who traced the footprint
- Who found the photos
- Who built the 3D model
- Who wrote the KG history

The city itself becomes a legible record of who built it.

---

## The Photogrammetry Mission — Detailed Design

This is the highest-engagement mechanic. A mission has:

```
Mission Card
────────────────────────────────────
📍 Saigon Central Post Office (1891)
   63 Rue Catinat (now Đồng Khởi)

PHOTO HUNT          ████████░░  8/15 photos
  ✅ Front facade (1905) — tagged by @nguyen_hoa
  ✅ South side (1912) — uploaded by @tran_family
  ❌ North side — NEEDED
  ❌ Aerial view — NEEDED
  ❌ Interior (1910s) — NEEDED

3D STATUS           ░░░░░░░░░░  Waiting for photos

CONTRIBUTORS        3 photo hunters, 0 architects
REWARD              Name on building · 500 pts · Landmark badge
────────────────────────────────────
[Find a photo for this mission →]
```

When the photo threshold is met, the mission automatically queues for SfM processing. An Architect volunteer claims it and runs COLMAP/Meshroom. When validated, all contributors get the reveal.

**The social share moment:**
> "I helped reconstruct the Saigon Central Post Office as it looked in 1910. See it here: [link to 3D viewer, timestamped to 1910]"

This is shareable, emotional, and directly promotes the platform.

---

## Ghost Buildings

Buildings that no longer exist — demolished, bombed, replaced — get special visual treatment: a translucent wireframe "ghost" in the 3D city, visible only when the timeline is set to their era.

Contributing to a ghost building earns the **Ghost Keeper** badge. These are often the most historically significant buildings — the ones that have vanished completely and exist only in archives.

This creates a specific emotional hook for the Vietnamese diaspora: *"My grandparents' house was here. I helped make it visible again."*

---

## Family Connection System

Any contributor can attach a personal connection to a KG building entity:
- "My family owned this building 1920–1945"
- "My grandfather worked here"
- "This was destroyed in [event]"

These are shown as soft data (clearly labelled as personal testimony, not verified historical fact) and create a layer of lived memory over the reconstructed city. The L6 layer — human interaction — made tangible.

Families contributing a verified connection get:
- Their family name on the building's KG page
- A private "family view" in the 4D timeline showing their era
- **Heritage Keeper** badge

---

## Technical Requirements

### New DB tables

```sql
-- Contribution tracking
CREATE TABLE contributions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles,
  type TEXT, -- 'photo_tag', 'footprint_trace', 'footprint_validate',
             -- 'photo_upload', 'sfm_mesh', 'kg_entity', 'kg_relation',
             -- 'document_transcription', 'family_connection'
  entity_id UUID, -- KG entity, map, building, etc.
  points INTEGER,
  metadata JSONB, -- type-specific data
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aggregated points on profiles
ALTER TABLE profiles ADD COLUMN points INTEGER DEFAULT 0;
ALTER TABLE profiles ADD COLUMN tier TEXT DEFAULT 'hunter';
-- tier: 'hunter' | 'cartographer' | 'architect' | 'historian'

-- Achievements/badges
CREATE TABLE achievements (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles,
  badge_id TEXT, -- 'street_detective', 'block_captain', etc.
  earned_at TIMESTAMPTZ DEFAULT now()
);

-- Building adoption
CREATE TABLE building_adoptions (
  id UUID PRIMARY KEY,
  building_id UUID REFERENCES kg_entities,
  user_id UUID REFERENCES profiles,
  status TEXT, -- 'claimed' | 'in_progress' | 'submitted' | 'validated'
  model_url TEXT, -- Supabase Storage URL when done
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Photogrammetry missions
CREATE TABLE missions (
  id UUID PRIMARY KEY,
  entity_id UUID REFERENCES kg_entities,
  title TEXT,
  description TEXT,
  target_type TEXT, -- 'photo_collection' | 'footprint_coverage' | 'kg_completion'
  target_count INTEGER,
  current_count INTEGER DEFAULT 0,
  status TEXT, -- 'open' | 'in_progress' | 'processing' | 'complete'
  reward_points INTEGER,
  reward_badge TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Teams
CREATE TABLE teams (
  id UUID PRIMARY KEY,
  name TEXT,
  description TEXT,
  district_claim TEXT, -- which district they're responsible for
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE team_members (
  team_id UUID REFERENCES teams,
  user_id UUID REFERENCES profiles,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
```

### New routes

| Route | Purpose |
|---|---|
| `/contribute` | Revamped hub with tier system and active missions |
| `/leaderboard` | Global + district + team leaderboards |
| `/missions` | Active and upcoming missions |
| `/missions/[id]` | Mission detail + progress + contributor list |
| `/profile/[id]` | Public contribution profile with badge showcase |
| `/adopt/[building_id]` | Building adoption flow |
| `/api/contributions` | Log contribution + award points |
| `/api/leaderboard` | Leaderboard queries |
| `/api/missions/[id]/contribute` | Add contribution to mission |

---

## Launch Sequence

**Phase 1 (with Phase 1 roadmap):** Photo Hunter + Cartographer tiers only
- District completion map goes live with the first colonial map corpus
- Leaderboard shows top photo taggers and map tracers
- First missions: photo hunts for 5 landmark buildings

**Phase 2 (with Phase 2 roadmap):** Historian tier
- KG entity contributions open
- Family connection system launches
- Team district claims enabled

**Phase 3 (with Phase 3 roadmap):** Architect tier
- Building adoption opens when Morlighem pipeline is adapted
- Photogrammetry missions go live
- Ghost buildings appear in 3D viewer
- Visual reveals begin

---

## Why This Works

The gamification is not cosmetic. Each tier directly feeds the data pipeline:

| Tier | Feeds |
|---|---|
| Photo Hunter | L3 photo corpus for SfM + photo texture projection |
| Cartographer | L4 footprint dataset (Phase 1 output) |
| Architect | L2–L3 3D models (Phase 3 output) |
| Historian | L4–L5 KG (Phase 2 output) |

The leaderboard is also the HITL quality signal — contributors with high validation scores get weighted more heavily in the consensus algorithm. Trust is earned, not assumed.
