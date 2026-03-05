/**
 * VWAI / CDEC data types and fetching utilities.
 *
 * The spreadsheet has two header rows:
 *   Row 0 — category groups
 *   Row 1 — column names
 * Data starts at row 2 (0-indexed).
 */

// ── Types ────────────────────────────────────────────────────────────

export interface CdecRecord {
	id: string;            // CDEC # (col 2)
	cdecLink: string;      // CDEC LINK (col 3)
	enteredBy: string;     // NGUYÊN TÊN — person who opened file (col 0)
	status: string;        // Processing status (col 1)
	logNum: string;        // LOG # (col 4)
	dateCollected: string; // NGÀY THU GIỬ (col 5)
	dateInfo: string;      // NGÀY THÔNG TIN (col 7)
	dateReport: string;    // NGÀY BÁO CÁO (col 8)
	locationText: string;  // XÃ/HUYỆN/TỈNH free-text (col 9)
	rawCoords: string;     // TỌA ĐỘ original (col 10)
	coordSystem: string;   // HỆ QUY CHIẾU (col 11)
	wgs84Coords: string;   // TỌA ĐỘ CHUYỂN HỆ WGS84 (col 12) — "lat lon"
	lat: number | null;
	lng: number | null;
	tacticalZone: string;  // VÙNG CHIẾN THUẬT/QUÂN KHU (col 13)
	province: string;      // TỈNH (col 14)
	district: string;      // HUYỆN (col 15)
	village: string;       // XÃ/LÀNG/THÔN/XÓM (col 16)
	docType: string;       // LOẠI TÀI LIỆU (col 33)
	personName: string;    // HỌ TÊN of subject (col 34)
	alias: string;         // BÍ DANH (col 35)
	birthDate: string;     // NGÀY/THÁNG/NĂM SINH (col 36)
	hometown: string;      // QUÊ QUÁN (col 37)
	unit: string;          // ĐƠN VỊ (col 42)
	summary: string;       // TÓM TẮT (col 44)
	colDivision: string;   // Collecting unit — SƯ ĐOÀN (col 18)
	colRegiment: string;   // Collecting unit — TRUNG ĐOÀN (col 20)
	eneDivision: string;   // Enemy unit — SƯ ĐOÀN F (col 26)
	eneRegiment: string;   // Enemy unit — TRUNG ĐOÀN E (col 27)
}

export type FilterColumn =
	| 'id'
	| 'status'
	| 'enteredBy'
	| 'logNum'
	| 'dateCollected'
	| 'dateInfo'
	| 'dateReport'
	| 'province'
	| 'district'
	| 'village'
	| 'tacticalZone'
	| 'locationText'
	| 'docType'
	| 'personName'
	| 'alias'
	| 'birthDate'
	| 'hometown'
	| 'unit'
	| 'summary'
	| 'colDivision'
	| 'colRegiment'
	| 'eneDivision'
	| 'eneRegiment';

export type FilterOperator =
	| 'is'
	| 'is_not'
	| 'contains'
	| 'not_contains'
	| 'is_empty'
	| 'is_not_empty';

export interface FilterRule {
	id: string;
	column: FilterColumn;
	operator: FilterOperator;
	value: string;
}

export interface FilterState {
	search: string;
	rules: FilterRule[];
	logic: 'AND' | 'OR';
	hasCoords: boolean;
}

export const EMPTY_FILTERS: FilterState = {
	search: '',
	rules: [],
	logic: 'AND',
	hasCoords: false,
};

export const FILTER_COLUMNS: { key: FilterColumn; label: string }[] = [
	{ key: 'id', label: 'CDEC #' },
	{ key: 'status', label: 'Status' },
	{ key: 'enteredBy', label: 'Entered By' },
	{ key: 'logNum', label: 'Log #' },
	{ key: 'dateCollected', label: 'Date Collected' },
	{ key: 'dateInfo', label: 'Date Info' },
	{ key: 'dateReport', label: 'Date Report' },
	{ key: 'province', label: 'Province' },
	{ key: 'district', label: 'District' },
	{ key: 'village', label: 'Village' },
	{ key: 'tacticalZone', label: 'Tactical Zone' },
	{ key: 'locationText', label: 'Location Text' },
	{ key: 'docType', label: 'Document Type' },
	{ key: 'personName', label: 'Person Name' },
	{ key: 'alias', label: 'Alias' },
	{ key: 'birthDate', label: 'Birth Date' },
	{ key: 'hometown', label: 'Hometown' },
	{ key: 'unit', label: 'Unit' },
	{ key: 'summary', label: 'Summary' },
	{ key: 'colDivision', label: 'Collecting Division' },
	{ key: 'colRegiment', label: 'Collecting Regiment' },
	{ key: 'eneDivision', label: 'Enemy Division (F)' },
	{ key: 'eneRegiment', label: 'Enemy Regiment (E)' },
];

export const FILTER_OPERATORS: { key: FilterOperator; label: string; needsValue: boolean }[] = [
	{ key: 'is', label: 'is', needsValue: true },
	{ key: 'is_not', label: 'is not', needsValue: true },
	{ key: 'contains', label: 'contains', needsValue: true },
	{ key: 'not_contains', label: 'does not contain', needsValue: true },
	{ key: 'is_empty', label: 'is empty', needsValue: false },
	{ key: 'is_not_empty', label: 'is not empty', needsValue: false },
];

// ── Column config ─────────────────────────────────────────────────────

export type CdecColorColumn =
	| 'province'
	| 'tacticalZone'
	| 'status'
	| 'docType'
	| 'colDivision'
	| 'eneDivision'
	| 'eneRegiment';

export interface VwaiConfig {
	colorColumn: CdecColorColumn;
	iconColumn: CdecColorColumn | null;
}

export const DEFAULT_CONFIG: VwaiConfig = {
	colorColumn: 'province',
	iconColumn: null,
};

export const CDEC_COLOR_COLUMNS: { key: CdecColorColumn; label: string }[] = [
	{ key: 'province', label: 'Province (Tỉnh)' },
	{ key: 'tacticalZone', label: 'Tactical Zone' },
	{ key: 'status', label: 'Status' },
	{ key: 'docType', label: 'Document Type' },
	{ key: 'colDivision', label: 'Collecting Division' },
	{ key: 'eneDivision', label: 'Enemy Division (F)' },
	{ key: 'eneRegiment', label: 'Enemy Regiment (E)' },
];

export function getColorValue(record: CdecRecord, col: CdecColorColumn): string {
	return (record[col] as string) ?? '';
}

// ── Data fetching ────────────────────────────────────────────────────

const SHEET_URL =
	'https://docs.google.com/spreadsheets/d/1j0pISHSltAZkb_QgouI8FiGEJUbzgm9TA4GezfZIFT8/export?format=csv';

function parseWgs84(coordStr: string): { lat: number; lng: number } | null {
	if (!coordStr?.trim()) return null;
	const parts = coordStr.trim().split(/[\s,]+/);
	if (parts.length >= 2) {
		const lat = parseFloat(parts[0]);
		const lng = parseFloat(parts[1]);
		if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) > 0.01 && Math.abs(lng) > 0.01) {
			// Basic sanity: Vietnam is roughly lat 8–24, lng 102–110
			return { lat, lng };
		}
	}
	return null;
}

export async function fetchCdecData(): Promise<CdecRecord[]> {
	const res = await fetch(SHEET_URL);
	if (!res.ok) throw new Error(`Failed to fetch spreadsheet: ${res.status}`);
	const text = await res.text();

	const rows = parseCsv(text);
	if (rows.length < 3) return [];

	// Row 0 = category headers, row 1 = column names, data from row 2
	const records: CdecRecord[] = [];
	const seenIds = new Set<string>();

	for (let i = 2; i < rows.length; i++) {
		const row = rows[i];
		if (!row || row.length < 3) continue;

		const cdecNum = (row[2] ?? '').trim();
		if (!cdecNum) continue;

		const status = (row[1] ?? '').trim();
		// Skip duplicate entries flagged in the sheet
		if (status.toLowerCase().includes('trùng')) continue;

		// Skip rows whose CDEC number we've already seen
		if (seenIds.has(cdecNum)) continue;
		seenIds.add(cdecNum);

		const wgs84 = (row[12] ?? '').trim();
		const coords = parseWgs84(wgs84);

		records.push({
			id: cdecNum,
			cdecLink: (row[3] ?? '').trim(),
			enteredBy: (row[0] ?? '').trim(),
			status,
			logNum: (row[4] ?? '').trim(),
			dateCollected: (row[5] ?? '').trim(),
			dateInfo: (row[7] ?? '').trim(),
			dateReport: (row[8] ?? '').trim(),
			locationText: (row[9] ?? '').trim(),
			rawCoords: (row[10] ?? '').trim(),
			coordSystem: (row[11] ?? '').trim(),
			wgs84Coords: wgs84,
			lat: coords?.lat ?? null,
			lng: coords?.lng ?? null,
			tacticalZone: (row[13] ?? '').trim(),
			province: (row[14] ?? '').trim(),
			district: (row[15] ?? '').trim(),
			village: (row[16] ?? '').trim(),
			docType: (row[33] ?? '').trim(),
			personName: (row[34] ?? '').trim(),
			alias: (row[35] ?? '').trim(),
			birthDate: (row[36] ?? '').trim(),
			hometown: (row[37] ?? '').trim(),
			unit: (row[42] ?? '').trim(),
			summary: (row[44] ?? '').trim(),
			colDivision: (row[18] ?? '').trim(),
			colRegiment: (row[20] ?? '').trim(),
			eneDivision: (row[26] ?? '').trim(),
			eneRegiment: (row[27] ?? '').trim(),
		});
	}

	return records;
}

// ── Filtering ────────────────────────────────────────────────────────

function evaluateRule(record: CdecRecord, rule: FilterRule): boolean {
	const fieldVal = ((record as unknown as Record<string, unknown>)[rule.column] as string) ?? '';
	const ruleVal = rule.value.toLowerCase();
	const fieldLower = fieldVal.toLowerCase();
	switch (rule.operator) {
		case 'is': return fieldLower === ruleVal;
		case 'is_not': return fieldLower !== ruleVal;
		case 'contains': return fieldLower.includes(ruleVal);
		case 'not_contains': return !fieldLower.includes(ruleVal);
		case 'is_empty': return !fieldVal.trim();
		case 'is_not_empty': return !!fieldVal.trim();
		default: return true;
	}
}

export function applyFilters(
	records: CdecRecord[],
	filters: FilterState,
	_colorColumn: CdecColorColumn = 'province',
): CdecRecord[] {
	return records.filter((r) => {
		if (filters.hasCoords && (r.lat === null || r.lng === null)) return false;

		if (filters.search) {
			const q = filters.search.toLowerCase();
			if (
				!r.id.toLowerCase().includes(q) &&
				!r.personName.toLowerCase().includes(q) &&
				!r.enteredBy.toLowerCase().includes(q) &&
				!r.locationText.toLowerCase().includes(q) &&
				!r.province.toLowerCase().includes(q) &&
				!r.summary.toLowerCase().includes(q)
			) {
				return false;
			}
		}

		if (filters.rules.length === 0) return true;

		const results = filters.rules.map((rule) => evaluateRule(r, rule));
		return filters.logic === 'OR' ? results.some(Boolean) : results.every(Boolean);
	});
}

// ── Color scheme ─────────────────────────────────────────────────────

const PROVINCE_PALETTE = [
	'#e63946', '#2a9d8f', '#e9c46a', '#f4a261', '#457b9d',
	'#9b5de5', '#00b4d8', '#ff9f1c', '#06d6a0', '#ef233c',
	'#fb5607', '#8338ec', '#3a86ff', '#ffbe0b', '#52b788',
	'#d62828', '#023e8a', '#606c38', '#bc6c25', '#4cc9f0',
];

const _colorCache = new Map<string, string>();

/** @deprecated use getCategoryColor */
export function getProvinceColor(province: string): string {
	return getCategoryColor(province);
}

export function getCategoryColor(value: string): string {
	if (!value) return '#adb5bd';
	const cached = _colorCache.get(value);
	if (cached) return cached;

	// Deterministic hash → color
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	const color = PROVINCE_PALETTE[hash % PROVINCE_PALETTE.length];
	_colorCache.set(value, color);
	return color;
}

// ── Icon shapes ───────────────────────────────────────────────────────

export type IconShape = 'circle' | 'square' | 'triangle' | 'diamond' | 'star';

const ICON_SHAPES: IconShape[] = ['circle', 'square', 'triangle', 'diamond', 'star'];

export function getIconShape(value: string): IconShape {
	if (!value) return 'circle';
	let hash = 0;
	for (let i = 0; i < value.length; i++) {
		hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
	}
	return ICON_SHAPES[hash % ICON_SHAPES.length];
}

// ── Unique value extractors ───────────────────────────────────────────

export function uniqueProvinces(records: CdecRecord[]): string[] {
	return [...new Set(records.map((r) => r.province).filter(Boolean))].sort();
}

export function uniqueTacticalZones(records: CdecRecord[]): string[] {
	return [...new Set(records.map((r) => r.tacticalZone).filter(Boolean))].sort();
}

export function uniqueStatuses(records: CdecRecord[]): string[] {
	return [...new Set(records.map((r) => r.status).filter(Boolean))].sort();
}

export function uniqueDocTypes(records: CdecRecord[]): string[] {
	return [...new Set(records.map((r) => r.docType).filter(Boolean))].sort();
}

// ── CSV parser ───────────────────────────────────────────────────────

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let i = 0;

	while (i < text.length) {
		const row: string[] = [];
		// Parse one row
		while (i < text.length) {
			if (text[i] === '"') {
				// Quoted field
				i++; // skip opening quote
				let field = '';
				while (i < text.length) {
					if (text[i] === '"') {
						if (text[i + 1] === '"') {
							field += '"';
							i += 2;
						} else {
							i++; // skip closing quote
							break;
						}
					} else {
						field += text[i];
						i++;
					}
				}
				row.push(field);
			} else {
				// Unquoted field
				let field = '';
				while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
					field += text[i];
					i++;
				}
				row.push(field.trim());
			}

			if (i >= text.length || text[i] === '\n' || text[i] === '\r') break;
			if (text[i] === ',') i++; // skip comma
		}

		// Skip line ending
		if (i < text.length && text[i] === '\r') i++;
		if (i < text.length && text[i] === '\n') i++;

		rows.push(row);
	}

	return rows;
}
