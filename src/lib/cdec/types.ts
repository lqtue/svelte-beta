export type CdecStatus = 'pending' | 'in_review' | 'submitted' | 'validated' | 'closed' | 'flagged' | 'duplicate';

export const STATUS_COLORS: Record<CdecStatus, string> = {
    pending:   '#475569',
    in_review: '#1d4ed8',
    submitted: '#7c3aed',
    validated: '#15803d',
    closed:    '#0f172a',
    flagged:   '#b91c1c',
    duplicate: '#c2410c',
};

export const STATUS_BG: Record<CdecStatus, string> = {
    pending:   '#f1f5f9',
    in_review: '#dbeafe',
    submitted: '#ede9fe',
    validated: '#dcfce7',
    closed:    '#e2e8f0',
    flagged:   '#fee2e2',
    duplicate: '#ffedd5',
};

export const STATUS_LABELS: Record<CdecStatus, string> = {
    pending:   'Pending',
    in_review: 'In Review',
    submitted: 'Submitted',
    validated: 'Validated',
    closed:    'Closed',
    flagged:   'Flagged',
    duplicate: 'Duplicate',
};

export interface CdecRecord {
    id: string;

    // Document identification
    cdec_number: string | null;
    cdec_link: string | null;
    rec_id: string | null;
    log_number: string | null;

    // Dates
    captured_date: string | null;
    captured_time: string | null;
    intel_date: string | null;
    report_date: string | null;

    // Location
    location_text: string | null;
    mgrs_raw: string | null;
    mgrs_validated: string | null;
    coord_datum: string | null;
    coord_wgs84_lat: number | null;
    coord_wgs84_lon: number | null;

    // Administrative
    tactical_zone: string | null;
    province: string | null;
    district: string | null;
    village: string | null;
    location_other: string | null;

    // Military units (system 1)
    unit_division: string | null;
    unit_brigade: string | null;
    unit_regiment: string | null;
    unit_battalion: string | null;
    unit_company: string | null;
    unit_platoon: string | null;
    unit_other: string | null;

    // Military units (system 2)
    unit2_division: string | null;
    unit2_brigade: string | null;
    unit2_regiment: string | null;
    unit2_battalion: string | null;
    unit2_company: string | null;
    unit2_platoon: string | null;
    unit2_other: string | null;

    // Personnel
    person_name: string | null;
    person_alias: string | null;
    person_dob: string | null;
    person_hometown: string | null;
    person_father: string | null;
    person_mother: string | null;
    person_spouse: string | null;
    person_relatives: string | null;
    person_unit: string | null;
    person_enlist_year: string | null;

    // Summary & analysis
    summary: string | null;
    family_info_current: string | null;
    unit_info_current: string | null;
    vmai_info: string | null;
    monument_info: string | null;
    us_info: string | null;
    rvn_info: string | null;

    // References & links
    ref_nara: string | null;
    ref_us_library: string | null;
    ref_vn_national_archive: string | null;
    ref_vn_library: string | null;
    ref_provincial_archive: string | null;
    ref_books: string | null;
    ref_internet: string | null;
    report_draft_link: string | null;
    photo_url: string | null;

    // Workflow
    assigned_to: string | null;
    claimed_at: string | null;
    status: CdecStatus;
    validator_1: string | null;
    validator_2: string | null;
    validated_at: string | null;
    notes: string | null;

    created_at: string;
    updated_at: string;
}

export type CdecRecordPatch = Partial<Omit<CdecRecord, 'id' | 'created_at' | 'updated_at'>>;

export interface CdecStats {
    total: number;
    by_status: Record<CdecStatus, number>;
    geolocated: number;
    assigned: number;
}

export interface CdecFilters {
    search?: string;
    status?: CdecStatus | 'all';
    province?: string;
    district?: string;
    tactical_zone?: string;
    geolocated?: boolean;
    date_from?: string;   // intel_date >=
    date_to?: string;     // intel_date <=
    assigned_to?: string | 'all' | 'unassigned';
    page?: number;
    limit?: number;
}
