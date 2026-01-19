/**
 * CSV parsing and formatting utilities
 */

export interface CsvParseOptions {
	delimiter?: string;
	hasHeader?: boolean;
	trimValues?: boolean;
}

export interface CsvRow {
	[key: string]: string;
}

/**
 * Parses a CSV string into an array of objects
 *
 * @example
 * ```ts
 * const csv = 'name,age\nAlice,30\nBob,25';
 * const data = parseCSV(csv);
 * // [{ name: 'Alice', age: '30' }, { name: 'Bob', age: '25' }]
 * ```
 */
export function parseCSV(csvString: string, options: CsvParseOptions = {}): CsvRow[] {
	const { delimiter = ',', hasHeader = true, trimValues = true } = options;

	const lines = csvString.trim().split(/\r?\n/);
	if (lines.length === 0) {
		return [];
	}

	const parseLine = (line: string): string[] => {
		const values: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			const nextChar = line[i + 1];

			if (inQuotes) {
				if (char === '"' && nextChar === '"') {
					current += '"';
					i++; // Skip next quote
				} else if (char === '"') {
					inQuotes = false;
				} else {
					current += char;
				}
			} else {
				if (char === '"') {
					inQuotes = true;
				} else if (char === delimiter) {
					values.push(trimValues ? current.trim() : current);
					current = '';
				} else {
					current += char;
				}
			}
		}

		values.push(trimValues ? current.trim() : current);
		return values;
	};

	if (!hasHeader) {
		return lines.map((line, index) => {
			const values = parseLine(line);
			const row: CsvRow = {};
			values.forEach((value, i) => {
				row[`col${i}`] = value;
			});
			return row;
		});
	}

	const headerLine = lines.shift();
	if (!headerLine) {
		return [];
	}

	const headers = parseLine(headerLine).map((h) => h.toLowerCase());

	return lines.map((line) => {
		const values = parseLine(line);
		const row: CsvRow = {};
		headers.forEach((header, index) => {
			row[header] = values[index] ?? '';
		});
		return row;
	});
}

/**
 * Escapes a value for CSV output
 *
 * @example
 * ```ts
 * csvEscape('Hello, "World"') // '"Hello, ""World"""'
 * ```
 */
export function csvEscape(value: unknown): string {
	const str = value === null || value === undefined ? '' : String(value);

	// If the value contains comma, newline, or double quote, wrap in quotes
	if (str.includes(',') || str.includes('\n') || str.includes('"') || str.includes('\r')) {
		return `"${str.replace(/"/g, '""')}"`;
	}

	return str;
}

/**
 * Converts an array of objects to a CSV string
 *
 * @example
 * ```ts
 * const data = [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }];
 * const csv = toCSV(data, ['name', 'age']);
 * // 'name,age\nAlice,30\nBob,25'
 * ```
 */
export function toCSV<T extends Record<string, unknown>>(
	data: T[],
	columns?: (keyof T)[],
	options: { delimiter?: string; includeHeader?: boolean } = {}
): string {
	const { delimiter = ',', includeHeader = true } = options;

	if (data.length === 0) {
		return '';
	}

	const cols = columns ?? (Object.keys(data[0]) as (keyof T)[]);
	const lines: string[] = [];

	if (includeHeader) {
		lines.push(cols.map((c) => csvEscape(String(c))).join(delimiter));
	}

	for (const row of data) {
		const values = cols.map((col) => csvEscape(row[col]));
		lines.push(values.join(delimiter));
	}

	return lines.join('\n');
}

/**
 * Parses CSV into objects with type casting
 *
 * @example
 * ```ts
 * const csv = 'name,age,active\nAlice,30,true';
 * const data = parseCSVTyped<{ name: string; age: number; active: boolean }>(
 *   csv,
 *   { age: Number, active: (v) => v === 'true' }
 * );
 * ```
 */
export function parseCSVTyped<T extends Record<string, unknown>>(
	csvString: string,
	casters: Partial<Record<keyof T, (value: string) => unknown>> = {},
	options: CsvParseOptions = {}
): T[] {
	const rows = parseCSV(csvString, options);

	return rows.map((row) => {
		const result = { ...row } as unknown as T;
		for (const [key, caster] of Object.entries(casters)) {
			if (key in row && caster) {
				(result as Record<string, unknown>)[key] = caster(row[key]);
			}
		}
		return result;
	});
}
