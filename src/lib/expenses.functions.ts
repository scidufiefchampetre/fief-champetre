import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { MOCK_EXPENSES } from "./mock-data";

const IS_MOCK = process.env["VITE_USE_MOCK_DATA"] === "true";

export interface ExpenseRow {
  id: string;
  timestamp: string;
  supplier: string;
  invoiceDate: string;
  amountTTC: number;
  category: string;
  place: string;
  paidBy: string;
  memberName: string;
  reimbursementStatus: string;
  finalSide: "SCI" | "Association";
  fileLink: string;
  depositor: string;
}

const Input = z.object({ spreadsheetId: z.string().nullable() });

export const listExpenses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    if (IS_MOCK) {
      return { spreadsheetId: "mock", rows: MOCK_EXPENSES };
    }
    const { ensureSpreadsheet, getRows, SCI_TAB, ASSO_TAB } =
      await import("../core/google/google.server");
    const spreadsheetId = await ensureSpreadsheet(data.spreadsheetId);
    const [sciRows, assoRows] = await Promise.all([
      getRows(spreadsheetId, `${SCI_TAB}!A2:R`).catch(() => [] as string[][]),
      getRows(spreadsheetId, `${ASSO_TAB}!A2:R`).catch(() => [] as string[][]),
    ]);
    const toExp = (r: string[], side: "SCI" | "Association"): ExpenseRow => ({
      id: r[17] ?? "",
      timestamp: r[0] ?? "",
      supplier: r[1] ?? "",
      invoiceDate: r[2] ?? "",
      amountTTC: Number((r[3] ?? "0").toString().replace(",", ".")) || 0,
      category: r[5] ?? "",
      place: r[7] ?? "",
      paidBy: r[8] ?? "",
      memberName: r[8] ?? "",
      reimbursementStatus: r[11] ?? "",
      finalSide: side,
      fileLink: r[15] ?? "",
      depositor: r[16] ?? "",
    });

    const rows: ExpenseRow[] = [
      ...sciRows.filter((r) => r[1]).map((r) => toExp(r, "SCI")),
      ...assoRows.filter((r) => r[1]).map((r) => toExp(r, "Association")),
    ];
    rows.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    return { spreadsheetId, rows };
  });
