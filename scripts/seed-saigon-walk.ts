/**
 * Seed the "Historic Saigon Walk" treasure hunt into Supabase.
 *
 * Usage:
 *   SUPABASE_SERVICE_KEY=your-service-role-key npx tsx scripts/seed-saigon-walk.ts
 *
 * Uses the service-role key to bypass RLS.
 * Assigns the hunt to the first admin user and marks it public.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env file manually (tsx doesn't auto-load it)
try {
  const envPath = resolve(import.meta.dirname || '.', '..', '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
} catch {}

const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY.');
  console.error('Usage: SUPABASE_SERVICE_KEY=xxx npx tsx scripts/seed-saigon-walk.ts');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const HUNT = {
  title: 'Historic Saigon Walk',
  description:
    'Walk through the heart of old Saigon and see the city transform across 200 years of maps — from a river outpost in 1799 to a bustling French colonial capital.',
  region: { center: [106.69917, 10.776], zoom: 15 },
  is_public: true
};

const STOPS = [
  {
    sort_order: 0,
    title: 'Notre-Dame Cathedral',
    description:
      'Built 1863-1880 with bricks shipped from Marseille. This was the spiritual centre of French Saigon. The 1878 city plan shows the cathedral square freshly laid out.',
    hint: 'Head to the red brick cathedral with twin bell towers near the central roundabout.',
    quest: 'Count the number of stained glass windows on the front facade.',
    lon: 106.69916,
    lat: 10.77972,
    trigger_radius: 15,
    interaction: 'proximity',
    overlay_map_id: 'b8a452dfbc8eeee2'
  },
  {
    sort_order: 1,
    title: 'Central Post Office',
    description:
      'Designed by Alfred Foulhoux and completed in 1891 in French colonial style. The 1898 plan shows the post office prominently on Rue Catinat — the main colonial boulevard.',
    hint: 'Cross the square from the cathedral to the grand yellow building with arched windows.',
    lon: 106.69972,
    lat: 10.77972,
    trigger_radius: 15,
    interaction: 'proximity',
    overlay_map_id: 'ed90c4244dbb9361'
  },
  {
    sort_order: 2,
    title: 'Dong Khoi Street (Rue Catinat)',
    description:
      'Once Rue Catinat — the Champs-Élysées of the East — this boulevard was the heart of colonial nightlife. The 1923 map shows elegant shop-houses lining both sides.',
    hint: 'Walk south down the tree-lined street toward the river. Stop at the intersection with Le Loi.',
    quest: 'Find a French-era building that still has its original balcony ironwork.',
    lon: 106.70222,
    lat: 10.77556,
    trigger_radius: 15,
    interaction: 'proximity',
    overlay_map_id: '061a18dda9835b42'
  },
  {
    sort_order: 3,
    title: 'Saigon Opera House',
    description:
      'Built in 1897 as the Opéra de Saïgon in French Beaux-Arts style. It served as the South Vietnamese National Assembly from 1955-1975. The 1882 plan shows this area before the opera was built.',
    hint: 'Look for the ornate white facade with columns on Lam Son Square.',
    lon: 106.70306,
    lat: 10.77639,
    trigger_radius: 15,
    interaction: 'proximity',
    overlay_map_id: '654dd627a3241cfe'
  },
  {
    sort_order: 4,
    title: 'Reunification Palace',
    description:
      'Originally the Norodom Palace (1868), rebuilt in 1966 as Independence Palace. A North Vietnamese tank crashed through these gates on April 30, 1975, ending the war. The 1942 plan shows the palace grounds in their wartime layout.',
    hint: 'Walk west through the park toward the modernist building with the wide lawn.',
    quest: 'Find the tank on the palace grounds — it is the actual T-54 that broke through.',
    lon: 106.69528,
    lat: 10.77694,
    trigger_radius: 20,
    interaction: 'proximity',
    overlay_map_id: '8b2e8a938709bed2'
  },
  {
    sort_order: 5,
    title: 'Ben Thanh Market',
    description:
      "Saigon's most iconic market, built in 1912 on the site of the old citadel moat. The 1912 map shows the entire Saigon-Cholon area, including the new market and the tramway that connected the two cities.",
    hint: 'Head south to the large market hall with the clock tower entrance.',
    quest: 'Buy a Vietnamese coffee and enjoy it while looking at how the market area appeared over 100 years ago.',
    lon: 106.69806,
    lat: 10.77222,
    trigger_radius: 20,
    interaction: 'proximity',
    overlay_map_id: '0e41cf9e297d7004'
  }
];

async function main() {
  // Find the first admin user to own the hunt
  const { data: admin, error: adminError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'admin')
    .limit(1)
    .single();

  if (adminError || !admin) {
    console.error('No admin user found in profiles table:', adminError);
    process.exit(1);
  }

  console.log(`Using admin user: ${admin.id}`);

  // Check if hunt already exists
  const { data: existing } = await supabase
    .from('hunts')
    .select('id')
    .eq('title', HUNT.title)
    .eq('user_id', admin.id)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log('Hunt already exists, skipping. ID:', existing[0].id);
    return;
  }

  // Insert the hunt
  const { data: hunt, error: huntError } = await supabase
    .from('hunts')
    .insert({
      user_id: admin.id,
      title: HUNT.title,
      description: HUNT.description,
      region: HUNT.region,
      is_public: HUNT.is_public
    })
    .select('id')
    .single();

  if (huntError || !hunt) {
    console.error('Failed to insert hunt:', huntError);
    process.exit(1);
  }

  console.log(`Created hunt: ${hunt.id}`);

  // Insert all stops
  const stopsWithHuntId = STOPS.map((stop) => ({
    hunt_id: hunt.id,
    ...stop
  }));

  const { error: stopsError } = await supabase
    .from('hunt_stops')
    .insert(stopsWithHuntId);

  if (stopsError) {
    console.error('Failed to insert stops:', stopsError);
    process.exit(1);
  }

  console.log(`Inserted ${STOPS.length} stops`);
  console.log('Done! The "Historic Saigon Walk" is now live.');
}

main();
