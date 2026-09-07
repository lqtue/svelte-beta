# NAC2's fifty Saigon maps — what we have and what we don't

Fetched 2026-09-07 from `https://www.nac2.gov.vn/csdl/bando/1–50.html` (Trung tâm
Lưu trữ quốc gia II / National Archives Center II, Ho Chi Minh City). Compared
against every `Saigon-HCMC` row in `maps`, drafts included.

## What the page actually is

An online exhibition — **"50 BẢN ĐỒ TIÊU BIỂU"**, fifty representative maps of
Saigon, Chợ Lớn and Ho Chi Minh City, 1859 to 2025. One HTML page per map, a
substantial Vietnamese caption (several hundred words: dating arguments,
annexation decrees with dates, what the sheet shows), and one JPEG. `51.html` is
a 404, so fifty is the whole set. The directory index is 403, so there is no
listing to scrape — the sequence is the API.

**The images are not usable.** They are web-size: 444×561, 735×541, 774×492, at
best 1330×988. Georeferencing needs a few thousand pixels on the long edge and
OCR needs more. There is no IIIF, no tile source, no deep-zoom, no manifest, no
download link and no rights statement anywhere on the page.

So this is a **shelf list, not a source**. Its value is that it says what NAC2
physically holds, which is the argument for writing to them, plus captions that
are real scholarship and would be worth citing as metadata.

## The overlap is three maps out of fifty

Matching by subject rather than by year — a shared year usually means two
different documents here:

| NAC2 | VMA | Confidence |
|---|---|---|
| #5 `ĐỒ ÁN THÀNH PHỐ SÀI GÒN 500.000 DÂN` (1862) | 1862 `Bâtiments civils: Le plan du Colonel du Génie Paul Coffyn pour une ville de 500.000 âmes` | Same map — Coffyn's plan for a city of 500,000 |
| #6 `BẢN ĐỒ CẢNG SÀI GÒN ĐO ĐẠC NĂM 1863` | 1863 `Plan du port de Saigon` (Humazur, Université Côte d'Azur) | Same survey, near certain |
| #38 `ĐÔ THÀNH SÀI GÒN, 1959, TỶ LỆ 1/10.000` | 1959 `Đô thành Sài Gòn` (Virtual Saigon / IRD) | Likely same sheet; scales need checking |

One near-miss worth eyes: NAC2 #15 is a 1882 topographic of *hạt 20* at
1/20,000, which is **not** our 1882 `Plan Cadastral` and probably not our 1882
`Saigon & Surroundings` either. Three different 1882 documents.

**Forty-seven of the fifty are maps the archive does not hold.**

## Visual check: five sheets are the same document, not three (2026-09-08)

The title-and-year comparison above found three overlaps. Downloading all fifty
images and all twenty-two of ours, laying both out as labelled contact sheets,
and then putting eight candidate pairs side by side at full size found **five**
— and one of them is a map NAC2 has attributed to the wrong century.

| NAC2 | VMA | Verdict |
|---|---|---|
| #1, captioned *De Larclause, 1/3/1859* | 1799 `Plan de la ville de Saigon` | **Same plate.** Their caption is wrong |
| #5 `Đồ án thành phố Sài Gòn 500.000 dân` | 1862 Coffyn | Same map, confirmed on the cartouche |
| #6 `Bản đồ cảng Sài Gòn đo đạc năm 1863` | 1863 `Plan du port de Saigon` | Same plate |
| #15 `Bản đồ địa hình hạt 20…` | 1882 `Saigon & Surroundings` | Same plate — see the naming note below |
| #38 `Đô thành Sài Gòn, 1959` | 1959 `Đô thành Sài Gòn` | Same edition; theirs is a folded copy shot in two halves |

**NAC2 #1 is not De Larclause.** The cartouche reads *"Plan de la Ville de
Saigon, fortifiée en 1790 par le Colonel Victor Olivier. Réduit du Grand Plan
levé par Ordre du Roi, en 1795, par Mr Brun, Ingénieur de sa Majesté ; par Jn M.
Dayot"* — the 1799 Brun–Dayot reduction, and the sheet carries a Bibliothèque
nationale stamp and the plate number `N° 3`. Their #2 carries the same title and
a different, genuinely 1859-looking sketch, so the likeliest explanation is that
the wrong image is attached to #1. Their caption for it — which describes the
citadel days after Gia Định fell — was therefore **not** copied into our record;
the record notes the discrepancy instead.

Checked and **not** matches, despite adjacent years: their #25 (1900 `Plan de
Saigon`, a city plan) against our 1900 `Environs de Saïgon` (a topographic
sheet); their #17 (1891 `Ville de Saigon`) against our 1898 `Plan cadastral`;
their #33 (1935) against our 1923 `Plan de Saigon-Cholon` — the same *series* of
municipal plans, successive editions, different plates. Also checked our own
1863 `Plan du port de Saigon` against our 1864 `Ville et port de Saigon`, in case
they were one map entered twice: they are two distinct Vidalin & Héraud plates,
the 1864 one carrying the `Passage de Vénus` mission heading and shelfmark
`Ge D 230`. No internal duplicate.

### What was written to the database

Their captions are real scholarship — dating arguments, decree numbers and
dates, street-by-street identifications — so a shortened Vietnamese version of
each now sits in `dc_description` on the four maps we hold, crediting the page
it came from. Vietnamese was kept deliberately: it is the language of the
scholarship and of most of the place names in it.

| Map | Field | Note |
|---|---|---|
| 1862 Coffyn | `dc_description` | replaced a one-line English restatement of the title |
| 1863 port | `dc_description` | was empty |
| 1882 20e arrondissement | `dc_description` | was empty |
| 1959 Đô thành Sài Gòn | `dc_description` | appended after the Virtual Saigon note, not over it |
| 1799 Brun–Dayot | `dc_description` | written from the cartouche, with the NAC2 mismatch flagged |
| 1799, 1882 | `original_title` | both held placeholders (`01. 1799`, `1882`); now the full cartouche text |

### One naming decision left open

Our 1882 sheet is catalogued as **`Saigon & Surroundings`**. Its cartouche says
*Cochinchine française. Plan topographique. 20ème Arrondissement et ses
environs.* NAC2's Vietnamese title is a literal translation of the real one and
ours is a loose English invention — theirs is better. The `original_title` is
now correct either way, but `name` is what a reader sees and what the share URL
titles, so changing it is a call to make deliberately rather than as a side
effect of this pass.

## The gaps, grouped

Ordered by how much they would change what the archive can answer.

1. **Chợ Lớn as a city in its own right — six maps, 1874–1902** (#10, 12, 13,
   14, 16, 21). We have **zero** Chợ Lớn-specific sheets; every one of our 22
   treats it as an appendage of Saigon. NAC2 has its 1874 master plan, its 1877
   and 1879 and 1881 annexation maps, Carmouze's 1890 survey and a 1902 city
   plan. This is the single largest hole, and it is a hole in a city of several
   hundred thousand people.
2. **The 1924–1944 planning series — ten maps** (#27–36). The Saigon master plan
   of 1924 at 1/5,000, Khánh Hội 1925, the 1926/1927/1929 studies for merging
   Saigon and Chợ Lớn, the 1931 building-zone map, 1935, 1937, the 1943 master
   plan, the 1944 Gia Định annexation. We hold 1923, 1930 and 1942 for the same
   twenty years, and none of ours is a planning document. Planning maps state
   intent; survey maps state fact. Having both is what lets you say what was
   built versus what was drawn.
3. **The 1859–1861 conquest plans — four maps** (#1–4). De Larclause's plan of
   1 March 1859, drawn days after the Gia Định citadel fell, plus 1860 and
   d'Ariès' 1861 proposal. Our earliest French plan is 1862, so this is the
   first three years of the colonial city, missing.
4. **The 1867–1894 boundary series — six maps** (#7, 8, 9, 11, 18, 19). 1867,
   1872 twice, the 1876 new-boundaries map, the 1888 map of villages under the
   Saigon courts, 1894. Our own record jumps 1864 → 1878.
5. **Republic-era 1956–1970 — eight maps** (#37, 39–45), including three city
   plans we lack (1956, 1960, 1966), the 1969 old-and-new district boundaries,
   and district-scale renewal projects: the Chánh Hưng landfill, Thanh Đa,
   Rạch Miễu. We hold 1958, 1959 and 1968 against that.
6. **1902–1906 — four maps** (#21–24), the commercial port and the Tân Hòa /
   Phú Thạnh annexation. We have nothing at all between 1900 and 1912.
7. **Everything after 1975 — five maps** (#46–50): 1988, 1996–97, 1998, 2010,
   2025. Our archive stops at 1968, so we currently cannot show the half-century
   in which the city changed most.

## What we have that they do not

Worth knowing before any conversation with them, because it is what we bring.

- **1791** `Plan de la rivière de Saïgon`, **1799** `Plan de la ville de Saigon`,
  **1815** Trần Văn Học's plan of Gia Định — the pre-colonial and early Nguyễn
  layer. Nothing in their fifty is older than 1859.
- **1882** `Plan Cadastral de la ville de Saigon` — the parcel-level survey our
  whole pipeline is built on. Theirs is a 1/20,000 topographic.
- 1864 Vidalin & Héraud port plan, 1878 Dufour, 1898, 1912 `Saigon - Cholon et
  Environs`, 1920 `Cochinchine Administrative`, 1922 `Carte routière`.
- And the thing the exhibition does not do at all: every one of our 39 published
  sheets is georeferenced, served as IIIF at full resolution, and openly
  licensed.

## What to do with this

- Treat the list as a **collecting target list**. Nothing here can be ingested
  as-is.
- Priorities 1 and 2 above are the ones that change what the archive can answer,
  not just how many rows it has. Chợ Lớn especially: the goal is change
  detection, and half the urban area is currently absent.
- Before approaching NAC2, check the BnF, ANOM (Aix-en-Provence) and the
  Vietnamese National Library first — several of these are French administrative
  productions with a good chance of a duplicate held somewhere that already
  publishes IIIF.
- The captions are citable scholarship. If any of these sheets is sourced
  elsewhere, the NAC2 page is a good `dc_description` reference.

## The list

`n` is the page number: `https://www.nac2.gov.vn/csdl/bando/<n>.html`. Years are
from the title where stated, otherwise from the caption's dating argument.

| Year | n | Title |
|---|---|---|
| 1859 | [1](https://www.nac2.gov.vn/csdl/bando/1.html) | BẢN ĐỒ SÀI GÒN VÀ CÁC VÙNG PHỤ CẬN DO DE LARCLAUSE, THIẾU ÚY TRUNG ĐOÀN SỐ 4 HẢI QUÂN VẼ NGÀY 1/3/1859. |
| 1859 | [2](https://www.nac2.gov.vn/csdl/bando/2.html) | BẢN ĐỒ SÀI GÒN VÀ CÁC VÙNG PHỤ CẬN DO DE LARCLAUSE, THIẾU ÚY TRUNG ĐOÀN SỐ 4 HẢI QUÂN VẼ NGÀY 1/3/1859 |
| 1860 | [3](https://www.nac2.gov.vn/csdl/bando/3.html) | SÀI GÒN NĂM 1860 |
| 1861 | [4](https://www.nac2.gov.vn/csdl/bando/4.html) | TÀI LIỆU CỦA ĐẠI TÁ HẢI QUÂN D’ARIÈS ĐỀ XUẤT XÂY DỰNG SÀI GÒN THÀNH MỘT THÀNH PHỐ KIỂU ÂU CHÂU |
| 1862 | [5](https://www.nac2.gov.vn/csdl/bando/5.html) | ĐỒ ÁN THÀNH PHỐ SÀI GÒN 500.000 DÂN |
| 1863 | [6](https://www.nac2.gov.vn/csdl/bando/6.html) | BẢN ĐỒ CẢNG SÀI GÒN ĐO ĐẠC NĂM 1863. |
| 1867 | [7](https://www.nac2.gov.vn/csdl/bando/7.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN NĂM 1867 |
| 1872 | [8](https://www.nac2.gov.vn/csdl/bando/8.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN NĂM 1872 |
| 1872 | [9](https://www.nac2.gov.vn/csdl/bando/9.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN NĂM 1872 |
| 1874 | [10](https://www.nac2.gov.vn/csdl/bando/10.html) | BẢN ĐỒ QUY HOẠCH TỔNG THỂ THÀNH PHỐ CHỢ LỚN NĂM 1874 |
| 1876 | [11](https://www.nac2.gov.vn/csdl/bando/11.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN THỂ HIỆN CÁC RANH GIỚI MỚI NĂM 1876 |
| 1877 | [12](https://www.nac2.gov.vn/csdl/bando/12.html) | THÀNH PHỐ CHỢ LỚN NĂM 1877 |
| 1879 | [13](https://www.nac2.gov.vn/csdl/bando/13.html) | BẢN ĐỒ THÀNH PHỐ CHỢ LỚN VÀ CÁC LÀNG ĐƯỢC SÁP NHẬP, DỰ KIẾN SẼ TẠO THÀNH LÃNH THỔ CỦA ĐÔ THỊ SẮP ĐƯỢC THÀNH LẬP |
| 1881 | [14](https://www.nac2.gov.vn/csdl/bando/14.html) | BẢN ĐỒ THÀNH PHỐ CHỢ LỚN VÀ CÁC LÀNG SÁP NHẬP (1881) |
| 1882 | [15](https://www.nac2.gov.vn/csdl/bando/15.html) | BẢN ĐỒ ĐỊA HÌNH HẠT 20 VÀ VÙNG PHỤ CẬN NĂM 1882, TỶ LỆ 1/20.000 |
| 1888 | [18](https://www.nac2.gov.vn/csdl/bando/18.html) | BẢN ĐỒ CÁC LÀNG THUỘC PHẠM VI QUYỀN TÀI PHÁN CỦA CÁC TÒA ÁN SÀI GÒN, TỶ LỆ 1/20.000 |
| 1890 | [16](https://www.nac2.gov.vn/csdl/bando/16.html) | BẢN ĐỒ THÀNH PHỐ CHỢ LỚN, DO ÔNG CARMOUZE, CHUYÊN VIÊN ĐO VẼ ĐỊA HÌNH, VẼ DƯỚI SỰ HƯỚNG DẪN CỦA ÔNG BERTAUX, TRƯỞNG PHÒNG ĐỊA CHÍNH, THEO LỆNH CỦA ÔNG DANEL, THỐNG ĐỐC NAM KỲ NĂM 1890, TỶ LỆ |
| 1891 | [17](https://www.nac2.gov.vn/csdl/bando/17.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN NĂM 1891, TỶ LỆ 1/4.000. |
| 1894 | [19](https://www.nac2.gov.vn/csdl/bando/19.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN NĂM 1894 |
| 1900 | [25](https://www.nac2.gov.vn/csdl/bando/25.html) | BẢN ĐỒ SÀI GÒN TỶ LỆ 1/20.000 |
| 1902 | [21](https://www.nac2.gov.vn/csdl/bando/21.html) | BẢN ĐỒ THÀNH PHỐ CHỢ LỚN NĂM 1902 |
| 1904 | [23](https://www.nac2.gov.vn/csdl/bando/23.html) | DỰ ÁN SÁP NHẬP LÀNG TÂN HÒA VÀ PHÚ THẠNH VÀO THÀNH PHỐ SÀI GÒN, |
| 1906 | [22](https://www.nac2.gov.vn/csdl/bando/22.html) | THƯƠNG CẢNG SÀI GÒN NĂM 1906 |
| 1906 | [24](https://www.nac2.gov.vn/csdl/bando/24.html) | THÀNH PHỐ SÀI GÒN VÀ CHỢ LỚN NĂM 1906 |
| 1924 | [27](https://www.nac2.gov.vn/csdl/bando/27.html) | BẢN ĐỒ QUY HOẠCH THÀNH PHỐ SÀI GÒN (1924), TỶ LỆ 1/5.000 |
| 1925 | [28](https://www.nac2.gov.vn/csdl/bando/28.html) | BẢN ĐỒ THIẾT KẾ MỘT PHẦN KHU KHÁNH HỘI NĂM 1925 |
| 1926 | [30](https://www.nac2.gov.vn/csdl/bando/30.html) | BẢN ĐỒ MỞ RỘNG VÀ KẾT NỐI SÀI GÒN-CHỢ LỚN, TỶ LỆ 1/10.000 |
| 1927 | [29](https://www.nac2.gov.vn/csdl/bando/29.html) | BẢN ĐỒ QUY HOẠCH LIÊN KẾT VÀ MỞ RỘNG SÀI GÒN-CHỢ LỚN (1927), TỶ LỆ |
| 1929 | [31](https://www.nac2.gov.vn/csdl/bando/31.html) | BẢN ĐỒ ĐỀ XUẤT RANH GIỚI MỞ RỘNG HAI THÀNH PHỐ SÀI GÒN VÀ CHỢ LỚN |
| 1931 | [32](https://www.nac2.gov.vn/csdl/bando/32.html) | BẢN ĐỒ CÁC KHU VỰC XÂY DỰNG – BẢN ĐỒ KHU SÀI GÒN-CHỢ LỚN, TỶ LỆ |
| 1935 | [33](https://www.nac2.gov.vn/csdl/bando/33.html) | BẢN ĐỒ CÁC THÀNH PHỐ SÀI GÒN VÀ CHỢ LỚN, TỶ LỆ 1/20.000 |
| 1937 | [34](https://www.nac2.gov.vn/csdl/bando/34.html) | BẢN ĐỒ THÀNH PHỐ SÀI GÒN VÀ CHỢ LỚN NĂM 1937 |
| 1943 | [35](https://www.nac2.gov.vn/csdl/bando/35.html) | BẢN ĐỒ KHU SÀI GÒN-CHỢ LỚN – BẢN ĐỒ QUY HOẠCH TỔNG THỂ NĂM 1943, TỶ LỆ 1/10.000 |
| 1944 | [36](https://www.nac2.gov.vn/csdl/bando/36.html) | BẢN ĐỒ SÁP NHẬP CÁC TRUNG TÂM VÀ CÁC XÃ NGOẠI Ô TỈNH GIA ĐỊNH VÀO VÙNG SÀI GÒN –CHỢ LỚN NĂM 1944. |
| 1956 | [37](https://www.nac2.gov.vn/csdl/bando/37.html) | HỌA ĐỒ ĐÔ THÀNH SÀI GÒN – CHỢ LỚN (1956), TỶ LỆ 1/20.000 |
| 1959 | [38](https://www.nac2.gov.vn/csdl/bando/38.html) | ĐÔ THÀNH SÀI GÒN, 1959, TỶ LỆ 1/10.000 |
| 1960 | [39](https://www.nac2.gov.vn/csdl/bando/39.html) | BẢN ĐỒ ĐÔ THÀNH SÀI GÒN (1960), TỶ LỆ 1/25.000 |
| 1966 | [42](https://www.nac2.gov.vn/csdl/bando/42.html) | BẢN ĐỒ ĐÔ THÀNH SÀI GÒN (1966), TỶ LỆ 1/25.000 |
| 1968 | [40](https://www.nac2.gov.vn/csdl/bando/40.html) | CÔNG TÁC BỒI LẤP KHU CHÁNH HƯNG |
| 1968 | [41](https://www.nac2.gov.vn/csdl/bando/41.html) | ĐỒ ÁN CHỈNH TRANG KHU GIẢI TRÍ THANH ĐA |
| 1969 | [43](https://www.nac2.gov.vn/csdl/bando/43.html) | BẢN ĐỒ ĐÔ THÀNH SÀI GÒN, RANH CŨ VÀ MỚI CÁC QUẬN (1969), TỶ LỆ |
| 1969 | [44](https://www.nac2.gov.vn/csdl/bando/44.html) | ĐỒ ÁN THIẾT KẾ ĐÔ THÀNH SÀI GÒN-CHỢ LỚN - HỌA ĐỒ HƯỚNG DẪN ĐẠO LỘ VÀ PHÂN KHU (1969), TỶ LỆ 1/10.000 |
| 1970 | [45](https://www.nac2.gov.vn/csdl/bando/45.html) | BẢN ĐỒ CHỈNH TRANG KHU RẠCH MIỄU |
| 1988 | [46](https://www.nac2.gov.vn/csdl/bando/46.html) | BẢN ĐỒ NỘI THÀNH THÀNH PHỐ HỒ CHÍ MINH, 1988 |
| 1997 | [47](https://www.nac2.gov.vn/csdl/bando/47.html) | BẢN ĐỒ PHÂN BỐ MỨC ĐỘ ĐÔ THỊ HÓA THÀNH PHỐ HỒ CHÍ MINH (1996-1997) |
| 1998 | [48](https://www.nac2.gov.vn/csdl/bando/48.html) | SƠ ĐỒ ĐỊNH HƯỚNG PHÁT TRIỂN KHÔNG GIAN ĐẾN NĂM 2020 (1998) |
| 2010 | [49](https://www.nac2.gov.vn/csdl/bando/49.html) | BẢN ĐỒ ĐỊNH HƯỚNG PHÁT TRIỂN KHÔNG GIAN ĐẾN NĂM 2025 (2010) |
| 2025 | [50](https://www.nac2.gov.vn/csdl/bando/50.html) | BẢN ĐỒ ĐỊNH HƯỚNG KHÔNG GIAN VÀ PHÁT TRIỂN ĐÔ THỊ (2025) |
| ? | [20](https://www.nac2.gov.vn/csdl/bando/20.html) | THÀNH Ô MA |
| ? | [26](https://www.nac2.gov.vn/csdl/bando/26.html) | THÀNH PHỐ SÀI GÒN, PHẦN PHÍA NAM KINH TẺ, TỶ LỆ 1/10.000 |

`#20` (Thành Ô Ma / Camp des Mares) and `#26` (Saigon south of the Kinh Tẻ canal,
1/10,000) carry no year in the title; their captions would settle it.

## Not chased

`nac2.gov.vn` links thirteen other exhibitions — `/saigon/`, `/angiang/`,
`/binhduong/`, `/cantho/`, `/condao/`, `/danang/`, `/haugiang/`, `/longan/`,
`/soctrang/`, `/tiengiang/`, `/vinhlong/`, `/nonsongtn/`, `/baucuqh/`. `/saigon/`
is a real exhibition on the same theme; four of the province links currently
serve the same COVID-19 page, so the nav is partly broken. Worth a second pass
if provincial coverage becomes a goal.
