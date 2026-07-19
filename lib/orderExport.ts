// CSV generation for the admin order export (3-03). Pure — the data comes
// from convex/admin.ts `exportOrder`, this module only shapes it into the
// file a supplier opens.
//
// Two column sets, because the two cases carry different information: an
// order with a jersey run exports one row per jersey to produce, while an
// order without one has nothing per-jersey to say and exports its own
// details instead. Silhouette specs (style/neckline/sleeve) live on the
// design since O-01, so they are per-row rather than per-order.

export type OrderExportRow = {
  designTitle: string;
  jerseyStyle: string;
  neckline: string;
  sleeveStyle: string;
  nameOnJersey: string;
  numberOnJersey: string;
  size: string;
  qty: number;
  submitterName: string;
  submitterEmail: string;
  submittedAt: number;
  customAnswers: Record<string, string>;
};

export type OrderExport = {
  teamName: string;
  sport: string;
  captainName: string;
  captainEmail: string;
  estimatedQuantity: number;
  orderDate: number;
  hasRun: boolean;
  customQuestions: Array<{ id: string; label: string }>;
  rows: OrderExportRow[];
};

// Leading characters a spreadsheet treats as the start of a formula. A team
// name or custom answer is attacker-controllable (the public fan form is
// open to the internet), and this file is opened in Excel/Sheets by someone
// who trusts it — so neutralize with a leading apostrophe, which spreadsheets
// strip on display but which stops evaluation.
const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r"];

function escapeCell(value: string): string {
  const guarded = FORMULA_PREFIXES.some((p) => value.startsWith(p))
    ? `'${value}`
    : value;
  return /[",\r\n']/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

// RFC 4180: CRLF row terminators, quotes doubled inside quoted fields.
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
}

// ISO date, not a locale format — the file crosses machines and a supplier
// reading 07/08 has no way to know which half is the month.
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function exportFilename(teamName: string, date: number): string {
  const slug =
    teamName
      .toLowerCase()
      // Apostrophes vanish rather than becoming separators, so "O'Brien's"
      // reads as one word instead of three.
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "order";
  return `sidestep-order-${slug}-${isoDate(date)}.csv`;
}

const RUN_HEADERS = [
  "Team name",
  "Sport",
  "Design",
  "Jersey style",
  "Neckline",
  "Sleeve style",
  "Name on jersey",
  "Number on jersey",
  "Size",
  "Quantity",
  "Submitted by",
  "Email",
  "Submitted on",
];

const ORDER_HEADERS = [
  "Team name",
  "Captain",
  "Captain email",
  "Sport",
  "Quantity",
  "Design",
  "Jersey style",
  "Neckline",
  "Sleeve style",
  "Order date",
];

export function buildOrderCsv(data: OrderExport): string {
  return data.hasRun ? toCsv(runRows(data)) : toCsv(orderRows(data));
}

function runRows(data: OrderExport): string[][] {
  const header = [...RUN_HEADERS, ...data.customQuestions.map((q) => q.label)];
  const rows = data.rows.map((row) => [
    data.teamName,
    data.sport,
    row.designTitle,
    row.jerseyStyle,
    row.neckline,
    row.sleeveStyle,
    row.nameOnJersey,
    row.numberOnJersey,
    row.size,
    String(row.qty),
    row.submitterName,
    row.submitterEmail,
    isoDate(row.submittedAt),
    ...data.customQuestions.map((q) => row.customAnswers[q.id] ?? ""),
  ]);
  return [header, ...rows];
}

// No run means no jerseys to enumerate, so the rows carry the order itself.
// One row per linked design (specs are per-design), or a single row with the
// design columns blank when nothing is linked yet.
function orderRows(data: OrderExport): string[][] {
  const orderCells = [
    data.teamName,
    data.captainName,
    data.captainEmail,
    data.sport,
    String(data.estimatedQuantity),
  ];
  const designs: OrderExportRow[] =
    data.rows.length > 0
      ? data.rows
      : [
          {
            designTitle: "",
            jerseyStyle: "",
            neckline: "",
            sleeveStyle: "",
            nameOnJersey: "",
            numberOnJersey: "",
            size: "",
            qty: 0,
            submitterName: "",
            submitterEmail: "",
            submittedAt: 0,
            customAnswers: {},
          },
        ];
  return [
    ORDER_HEADERS,
    ...designs.map((d) => [
      ...orderCells,
      d.designTitle,
      d.jerseyStyle,
      d.neckline,
      d.sleeveStyle,
      isoDate(data.orderDate),
    ]),
  ];
}
