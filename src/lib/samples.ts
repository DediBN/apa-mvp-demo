// Known answers for the Studio Noa demo workbook (public/samples/studio-noa-demo.xlsx). Every finding was planted when
// the file was generated and re-checked against the file itself, so a run on an example is scored against facts —
// not against an audit the judge makes up on the spot. Your own files are still scored by the judge's audit.

export type SampleKey = "stock" | "prices" | "calendar";

export const SAMPLE_ANSWER_KEYS: Record<SampleKey, string> = {
  stock: [
    "Exactly 12 products are below minimum stock (current stock strictly less than minimum): SKU-1006 Biofor (3<5), SKU-1007 NOON Aesthetics (3<5), SKU-1009 Dermalex (2<5), SKU-1010 Sothys Paris (3<4), SKU-1011 Lira Clinical (2<4), SKU-1012 Anubis Barcelona (2<4), SKU-1035 Lira Clinical (1<5), SKU-1040 KB Pure (1<3), SKU-1041 HL Always Active (4<5), SKU-1042 Biofor (4<5), SKU-1043 NOON Aesthetics (2<3), SKU-1047 Lira Clinical (3<5).",
    "Every one of these 12 products appears in the order list — none is missing.",
    "Products exactly at minimum are not below minimum and are not flagged as below: SKU-1018, SKU-1022, SKU-1028, SKU-1049, SKU-1050.",
    "No product other than the 12 is flagged as below minimum.",
    "The order is grouped by supplier: Biofor (SKU-1006, SKU-1042), NOON Aesthetics (SKU-1007, SKU-1043), Dermalex (SKU-1009), Sothys Paris (SKU-1010), Lira Clinical (SKU-1011, SKU-1035, SKU-1047), Anubis Barcelona (SKU-1012), KB Pure (SKU-1040), HL Always Active (SKU-1041).",
    "Each ordered line has a quantity and a cost, and the cost uses a price that appears in the file for that product."
  ].join("\n"),
  prices: [
    "Lira Clinical raised prices in October 2026 by about 7% on SKU-1011 (186→199), SKU-1023 (257→275), SKU-1035 (255→273) and SKU-1047 (293→313).",
    "SKU-1009 Dermalex rose from 254 to 295 in October 2026 (+16.1%).",
    "SKU-1028 KB Pure rose from 277 to 310 in October 2026 (+11.9%).",
    "SKU-1036 Anubis Barcelona rose from 219 to 250 in October 2026 (+14.2%).",
    "Every other product kept the same price in August, September and October 2026 and is not reported as a price increase.",
    "Each increase is stated with the old price, the new price and the change."
  ].join("\n"),
  calendar: [
    "Double booking on 3.11.2026 at 10:00: מיכל נחום (C-102) and שירה דהן (C-103) are both booked.",
    "Seven regular clients have not come back for well over their usual interval and have nothing booked: רחל גולן (C-131), לאה אברהם (C-132), אביטל אזולאי (C-133), הדס פרץ (C-134), יובל אברהם (C-135), ספיר לוי (C-136), עינב אוחיון (C-137).",
    "אנה קפלן did not show up three times (2.7, 16.8 and 30.9.2026) — a repeat no-show.",
    "סיגל כהן (C-113) has a note 'עור רגיש, להימנע מחומצות' but is booked for a chemical peel (פילינג כימי) on 5.11.2026 at 12:00.",
    "November birthdays: יעל נחום (C-104, 2.11), רוני רוזן (C-107, 8.11), הילה טל (C-108, 8.11), מאיה פרידמן (C-106, 9.11), תמר אזולאי (C-105, 14.11)."
  ].join("\n")
};
