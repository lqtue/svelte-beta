/**
 * One-time script to migrate map catalog from Google Sheets CSV to Supabase.
 *
 * Usage:
 *   npx tsx scripts/migrate-maps.ts
 *
 * Requires environment variables:
 *   SUPABASE_URL       — your Supabase project URL
 *   SUPABASE_SERVICE_KEY — service-role key (admin access, NOT the anon key)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const DATASET_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQivs6N80xA_Pgs0J8MMMTGcH4YLzjhhyxPUoMcoQTxHjUyRXo5FMOICXDSxayDcLYisABkoqvXiIiA/pub?gid=0&single=true&output=csv';

interface MapRow {
  allmaps_id: string;
  name: string;
  type: string | null;
  summary: string | null;
  description: string | null;
  thumbnail: string | null;
  is_featured: boolean;
  year: number | null;
}

function parseCSV(text: string): MapRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  // Parse header
  const headerLine = lines.shift()!;
  const header: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < headerLine.length; i++) {
    const char = headerLine[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      header.push(current.replace(/^"|"$/g, '').trim().toLowerCase());
      current = '';
    } else {
      current += char;
    }
  }
  header.push(current.replace(/^"|"$/g, '').trim().toLowerCase());

  const rows: MapRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const cells: string[] = [];
    let cellCurrent = '';
    let cellInQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        cellInQuotes = !cellInQuotes;
      } else if (char === ',' && !cellInQuotes) {
        cells.push(cellCurrent.replace(/^"|"$/g, '').trim());
        cellCurrent = '';
      } else {
        cellCurrent += char;
      }
    }
    cells.push(cellCurrent.replace(/^"|"$/g, '').trim());

    const row: Record<string, string> = {};
    header.forEach((key, i) => {
      row[key] = cells[i] || '';
    });

    const id = row['id'];
    const name = row['name'];
    if (!id || !name) continue;

    const year = parseInt(row['year'], 10);
    const featuredValue = row['featured'] || row['is_featured'] || '';
    const isFeatured =
      /^y(es)?$/i.test(featuredValue) ||
      /^true$/i.test(featuredValue) ||
      featuredValue === '1' ||
      featuredValue.toLowerCase() === 'x';

    rows.push({
      allmaps_id: id,
      name,
      type: row['type'] || null,
      summary: row['summary'] || null,
      description: row['description'] || row['details'] || row['detail'] || null,
      thumbnail: row['thumbnail'] || row['image'] || null,
      is_featured: isFeatured,
      year: isNaN(year) ? null : year
    });
  }

  return rows;
}

async function main() {
  console.log('Fetching map catalog from Google Sheets...');
  const response = await fetch(DATASET_URL);
  if (!response.ok) {
    console.error(`Failed to fetch CSV: HTTP ${response.status}`);
    process.exit(1);
  }
  const text = await response.text();
  const maps = parseCSV(text);

  console.log(`Parsed ${maps.length} maps from CSV.`);

  if (maps.length === 0) {
    console.log('No maps to insert.');
    return;
  }

  // Upsert to avoid duplicates on re-run
  const { data, error } = await supabase
    .from('maps')
    .upsert(maps, { onConflict: 'allmaps_id' })
    .select();

  if (error) {
    console.error('Supabase insert error:', error);
    process.exit(1);
  }

  console.log(`Successfully upserted ${data.length} maps into Supabase.`);
}

main();
