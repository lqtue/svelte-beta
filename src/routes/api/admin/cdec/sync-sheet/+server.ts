import { json, error } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_KEY } from '$env/static/private';
import type { RequestHandler } from './$types';
import type { Database } from '$lib/supabase/types';

const SHEET_ID = '1j0pISHSltAZkb_QgouI8FiGEJUbzgm9TA4GezfZIFT8';
const GVIZ_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv`;

const STATUS_MAP: Record<string, string> = {
    'đã duyệt xong':        'validated',
    'đang xử lý':           'in_review',
    'đang duyệt':           'in_review',
    'đang duyệt lần 1':     'in_review',
    'đã duyệt lần 1':       'submitted',
    'cần duyệt':            'pending',
    'không cần làm':        'closed',
    'trùng hồ sơ ở trên':  'duplicate',
    'fuv':                   'flagged',
};

/** Minimal RFC 4180 CSV parser. */
function parseCSV(text: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;
    let i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuotes) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; }
            else if (ch === '"')                    { inQuotes = false; i++; }
            else                                    { field += ch; i++; }
        } else {
            if      (ch === '"')  { inQuotes = true; i++; }
            else if (ch === ',')  { row.push(field); field = ''; i++; }
            else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; }
            else if (ch === '\r') { i++; }
            else                  { field += ch; i++; }
        }
    }
    if (field || row.length > 0) { row.push(field); rows.push(row); }
    return rows;
}

/** Try to normalise common date strings to YYYY-MM-DD for Postgres. */
function parseDate(raw: string): string | null {
    const s = raw.trim();
    if (!s) return null;
    // Already ISO: 1967-03-30 or 1967/03/30
    const iso = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
    if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
    // DD/MM/YYYY
    const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
    return null;
}

export const POST: RequestHandler = async ({ locals }) => {
    const { session, user } = await locals.safeGetSession();
    if (!session || !user) throw error(401, 'Unauthorized');

    const supabase = createClient<Database>(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profileData } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if ((profileData as any)?.role !== 'admin') throw error(403, 'Admin only');

    // Fetch the Google Sheet as CSV via gviz (works for publicly visible sheets)
    let csvText: string;
    try {
        const res = await fetch(GVIZ_URL);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        csvText = await res.text();
    } catch (e: any) {
        throw error(502, `Could not fetch Google Sheet: ${e.message}`);
    }

    const rows = parseCSV(csvText);
    if (rows.length < 2) throw error(400, 'Sheet appears empty');

    // Map header names → column indices (case/accent insensitive prefix match)
    const headers = rows[0].map(h => h.trim().toLowerCase());
    const col = (frag: string) => headers.findIndex(h => h.includes(frag.toLowerCase()));

    const iStatus        = col('trạng thái');
    const iCdecNum       = col('số cdec');
    const iLink          = col('cdec link');
    const iRec           = col('rec #');
    const iLog           = col('log #');
    const iCapturedDate  = col('lúc nào ngày');
    const iCapturedTime  = col('giờ thu');
    const iIntelDate     = col('ngày thông tin');
    const iReportDate    = col('ngày báo cáo');
    const iLocationText  = col('địa điểm');
    const iMgrs          = col('tọa độ');        // first match = raw coord column
    const iDatum         = col('hệ quy chiếu');
    const iWgs84         = col('tọa độ chuyển'); // WGS84 converted column
    const iTactical      = col('vùng chiến thuật');
    const iProvince      = col('tỉnh');
    const iDistrict      = col('huyện');
    const iVillage       = col('xã');
    const iNotes         = col('khác');

    const records: Record<string, unknown>[] = [];
    const statusCounts: Record<string, number> = {};

    for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const cdecNum = row[iCdecNum]?.trim();
        if (!cdecNum) continue;

        const rawStatus = (row[iStatus] ?? '').trim().toLowerCase();
        const dbStatus  = STATUS_MAP[rawStatus]; // undefined → don't touch existing status

        // Parse WGS84 coords: "11.89720, 106.61872"
        let lat: number | null = null;
        let lon: number | null = null;
        const wgs84 = iWgs84 >= 0 ? row[iWgs84]?.trim() : '';
        if (wgs84) {
            const parts = wgs84.split(',').map(s => parseFloat(s.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                lat = parts[0]; lon = parts[1];
            }
        }

        const rec: Record<string, unknown> = { cdec_number: cdecNum };

        if (dbStatus)                                          rec.status          = dbStatus;
        if (iLink >= 0         && row[iLink]?.trim())         rec.cdec_link       = row[iLink].trim();
        if (iRec >= 0          && row[iRec]?.trim())          rec.rec_id          = row[iRec].trim();
        if (iLog >= 0          && row[iLog]?.trim())          rec.log_number      = row[iLog].trim();
        if (iCapturedDate >= 0 && row[iCapturedDate]?.trim()) rec.captured_date   = parseDate(row[iCapturedDate]);
        if (iCapturedTime >= 0 && row[iCapturedTime]?.trim()) rec.captured_time   = row[iCapturedTime].trim();
        if (iIntelDate >= 0    && row[iIntelDate]?.trim())    rec.intel_date      = parseDate(row[iIntelDate]);
        if (iReportDate >= 0   && row[iReportDate]?.trim())   rec.report_date     = parseDate(row[iReportDate]);
        if (iLocationText >= 0 && row[iLocationText]?.trim()) rec.location_text   = row[iLocationText].trim();
        if (iMgrs >= 0         && row[iMgrs]?.trim())         rec.mgrs_raw        = row[iMgrs].trim();
        if (iDatum >= 0        && row[iDatum]?.trim())         rec.coord_datum    = row[iDatum].trim();
        if (lat !== null)                                      rec.coord_wgs84_lat = lat;
        if (lon !== null)                                      rec.coord_wgs84_lon = lon;
        if (iTactical >= 0     && row[iTactical]?.trim())     rec.tactical_zone   = row[iTactical].trim();
        if (iProvince >= 0     && row[iProvince]?.trim())     rec.province        = row[iProvince].trim();
        if (iDistrict >= 0     && row[iDistrict]?.trim())     rec.district        = row[iDistrict].trim();
        if (iVillage >= 0      && row[iVillage]?.trim())      rec.village         = row[iVillage].trim();
        if (iNotes >= 0        && row[iNotes]?.trim())        rec.notes           = row[iNotes].trim();

        records.push(rec);

        const sk = dbStatus ?? '(no change)';
        statusCounts[sk] = (statusCounts[sk] ?? 0) + 1;
    }

    if (records.length === 0) throw error(400, 'No valid CDEC records found in sheet');

    const { data, error: dbErr } = await supabase
        .from('cdec_records')
        .upsert(records as any, { onConflict: 'cdec_number', ignoreDuplicates: false })
        .select('id');

    if (dbErr) throw error(500, dbErr.message);

    return json({ upserted: data?.length ?? 0, total: records.length, statusCounts });
};
