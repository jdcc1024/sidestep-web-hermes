// CSV generation for the admin order export (3-03). Pure — the data comes
// from convex/admin.ts `exportOrder`, this module only shapes it into the
// file a supplier opens. Serialization, slugging and dates come from
// `lib/csv.ts`, shared with the captain's roster export (M-08).
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
  // "Captain" / "Assistant captain" / "" (M-09) — already in words when it
  // gets here, since production reads this file and has no key to a letter.
  roleOnJersey: string;
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

import { csvSlug, isoDate, toCsv } from "./csv";

export function exportFilename(teamName: string, date: number): string {
  return `sidestep-order-${csvSlug(teamName) || "order"}-${isoDate(date)}.csv`;
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
  "Role",
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
    row.roleOnJersey,
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
            roleOnJersey: "",
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
