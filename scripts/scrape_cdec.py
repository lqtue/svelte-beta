#!/usr/bin/env python3
"""
Scrape CDEC Vietnam TTU archive search results to CSV.
Two-pass: collect all records in memory, then write with full column set.
"""
import requests
from bs4 import BeautifulSoup
import hashlib, csv, re, time, sys, os
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading

BASE = 'https://cdec.vietnam.ttu.edu'
OUT_PATH = 'cdec_loc_ninh_F0346.csv'
NUM_WORKERS = 2
TIMEOUT = 60
MAX_RETRIES = 5
SLEEP_BETWEEN = 1.5

SEARCH_URL = (BASE + '/search/results.php?utf8=%E2%9C%93&advanced=true'
    '&op%5B0%5D=AND&op%5B1%5D=AND&op%5B2%5D=AND&op%5B3%5D=AND&op%5B4%5D=AND'
    '&op%5B5%5D=AND&op%5B6%5D=AND&op%5B7%5D=AND&op%5B8%5D=AND&op%5B9%5D=AND'
    '&op%5B10%5D=AND&op%5B11%5D=AND&op%5B12%5D=AND&op%5B13%5D=AND&op%5B14%5D=AND'
    '&q%5B0%5D=loc+ninh&q%5B1%5D=&q%5B2%5D=&q%5B3%5D=&q%5B4%5D=&q%5B5%5D='
    '&q%5B6%5D=&q%5B7%5D=&q%5B8%5D=&q%5B9%5D=&q%5B10%5D=F0346&q%5B11%5D='
    '&q%5B12%5D=cdec&q%5B13%5D=text&q%5B14%5D='
    '&field%5B0%5D=&field%5B1%5D=&field%5B2%5D=&field%5B3%5D=&field%5B4%5D=title'
    '&field%5B5%5D=coll_name_u_utext&field%5B6%5D=cdec_capture_u_udate'
    '&field%5B7%5D=end_cdec_capture_u_udate&field%5B8%5D=cdec_report_u_udate'
    '&field%5B9%5D=end_cdec_report_u_udate&field%5B10%5D=do_coll_num_u_ustr'
    '&field%5B11%5D=copyrighted_u_ustr&field%5B12%5D=primary_type'
    '&field%5B13%5D=digital_object_type&field%5B14%5D=reel_u_ustr')

SEP = ' | '

PRIORITY = [
    'rec_id', 'record_url', 'Item Number', 'Title', 'Language', 'Other Language',
    'Pages', 'Captured Date', 'Report Date', 'Intel Date', 'Batch Number',
    'Origin Office', 'Human Source Number', 'Col. Proj. Number',
    'Source', 'Country', 'Related Country',
    'Security Classification', 'Document Type',
    'Map Locations', 'map_grid_ref', 'map_lat', 'map_lon',
    'Log Number', 'Intel', 'Subject', 'Keyword',
    'Organization', 'Personality',
    'Location', 'Location C', 'Location P',
]

_local = threading.local()
_write_lock = threading.Lock()

def make_session():
    s = requests.Session()
    s.headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
    p_hash = hashlib.sha512('vW@1@123'.encode()).hexdigest()
    for attempt in range(MAX_RETRIES):
        try:
            r = s.post(BASE + '/includes/process_login.php',
                data={'username': 'lqtue', 'password': '', 'p': p_hash},
                timeout=TIMEOUT)
            if 'lqtue' not in r.text:
                raise RuntimeError('Login failed: ' + r.url)
            return s
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            print(f'Login attempt {attempt+1} failed ({e}), retrying in {3*(attempt+1)}s...')
            time.sleep(3 * (attempt + 1))

def get_session():
    if not hasattr(_local, 'session'):
        _local.session = make_session()
    return _local.session

def get_all_rec_ids(s):
    print('Collecting record IDs...')
    rec_ids = []
    page = 1
    while True:
        url = SEARCH_URL + (f'&page={page}' if page > 1 else '&commit=Search')
        r = s.get(url, timeout=30)
        soup = BeautifulSoup(r.text, 'html.parser')
        links = soup.find_all('a', href=re.compile(r'item\.php\?rec=\d+'))
        if not links:
            break
        for l in links:
            m = re.search(r'rec=(\d+)', l['href'])
            if m:
                rec_ids.append(m.group(1))
        pag = soup.find_all('a', href=re.compile(r'page=\d+'))
        page_nums = [int(re.search(r'page=(\d+)', p['href']).group(1)) for p in pag]
        if page + 1 in page_nums:
            page += 1
            time.sleep(0.5)
        else:
            break
    return rec_ids

def fetch_with_retry(s, url):
    for attempt in range(MAX_RETRIES):
        try:
            return s.get(url, timeout=TIMEOUT)
        except Exception as e:
            if attempt == MAX_RETRIES - 1:
                raise
            time.sleep(2 ** attempt)

def parse_item(rec_id):
    s = get_session()
    url = BASE + f'/search/item.php?rec={rec_id}'
    r = fetch_with_retry(s, url)
    soup = BeautifulSoup(r.text, 'html.parser')

    multi = defaultdict(list)
    grid_refs = []
    lats = []
    lons = []

    for dl in soup.find_all('dl'):
        dts = dl.find_all('dt')
        dds = dl.find_all('dd')
        for dt, dd in zip(dts, dds):
            key = dt.get_text(strip=True)
            if key == 'Map Locations':
                # Extract grid ref from first <a> (VVA map search link)
                links = dd.find_all('a')
                grid_ref = links[0].get_text(strip=True) if len(links) >= 1 else ''
                # Extract coords from second <a> (Google Maps link)
                coord_text = links[1].get_text(strip=True) if len(links) >= 2 else ''
                m = re.search(r'([0-9.]+)°,\s*([0-9.]+)°', coord_text)
                lat = m.group(1) if m else ''
                lon = m.group(2) if m else ''
                grid_refs.append(grid_ref)
                lats.append(lat)
                lons.append(lon)
                val = f'{grid_ref} [{coord_text}]'
            else:
                val = dd.get_text(strip=True)
            multi[key].append(val)

    record = {'rec_id': rec_id, 'record_url': url}
    for key, vals in multi.items():
        record[key] = SEP.join(vals)

    record['map_grid_ref'] = SEP.join(grid_refs)
    record['map_lat'] = SEP.join(lats)
    record['map_lon'] = SEP.join(lons)

    time.sleep(SLEEP_BETWEEN)
    return record

def main():
    s = make_session()
    print('Logged in.')
    rec_ids = get_all_rec_ids(s)
    print(f'Found {len(rec_ids)} records. Fetching details with {NUM_WORKERS} workers...')

    records = []
    errors = 0
    total = len(rec_ids)

    with ThreadPoolExecutor(max_workers=NUM_WORKERS) as executor:
        futures = {executor.submit(parse_item, rid): rid for rid in rec_ids}
        for future in as_completed(futures):
            rid = futures[future]
            try:
                record = future.result()
                records.append(record)
                print(f'[{len(records)}/{total}] rec={rid} | {record.get("Item Number","?")} | grid={record.get("map_grid_ref","")} lat={record.get("map_lat","")}')
            except Exception as e:
                errors += 1
                print(f'ERROR rec={rid}: {e}', file=sys.stderr)

    # Build full ordered field list from all records
    all_keys = set()
    for r in records:
        all_keys.update(r.keys())

    fieldnames = [f for f in PRIORITY if f in all_keys]
    fieldnames += sorted(f for f in all_keys if f not in fieldnames)

    with open(OUT_PATH, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        # Sort by rec_id numerically for consistent output
        for record in sorted(records, key=lambda r: int(r['rec_id'])):
            writer.writerow(record)

    print(f'\nDone. {len(records)} records saved to {OUT_PATH}. {errors} errors.')

if __name__ == '__main__':
    main()
