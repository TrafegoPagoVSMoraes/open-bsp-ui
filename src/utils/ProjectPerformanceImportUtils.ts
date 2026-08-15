import readXlsxFile from "read-excel-file/browser";

export type PerformanceImportRow = {
  metric_date: string;
  spend: number;
  leads: number;
  group_joins: number;
  reach: number;
  notes: string | null;
};

export type PerformanceImportPreview = {
  rows: PerformanceImportRow[];
  considered: number;
  ignored: number;
  invalid: number;
  hasProjectColumn: boolean;
  issues: Array<{
    row: number;
    kind: "ignored" | "invalid";
    reason: string;
  }>;
};

const DATE_KEYS = ["data", "date", "dia", "reporting_starts", "inicio_dos_relatorios"];
const SPEND_KEYS = ["valor_gasto", "gasto", "spend", "amount_spent", "valor_usado"];
const LEAD_KEYS = ["leads", "resultados", "cadastros", "quantidade_de_leads"];
const GROUP_KEYS = ["entraram_no_grupo", "group_joins", "leads_no_grupo", "grupo"];
const REACH_KEYS = ["alcance", "reach"];
const PROJECT_KEYS = ["projeto", "project", "campanha", "campaign", "campaign_name", "nome_da_campanha"];
const NOTES_KEYS = ["observacoes", "observacao", "notes", "comentarios"];

const normalizeKey = (value: string) => value.trim().toLocaleLowerCase("pt-BR")
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "");
const normalizeIdentity = (value: string) => normalizeKey(value).replace(/_/g, "-");
const pick = (row: Record<string, string>, keys: string[]) => keys.map((key) => row[key]).find(Boolean) ?? "";

function parseNumber(value: string) {
  const raw = value.trim().replace(/[^0-9,.-]/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Number.NaN;
}

function parseDate(value: string) {
  const trimmed = value.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const validDate = (year: string, month: string, day: string) => {
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
    return date.getUTCFullYear() === Number(year) &&
      date.getUTCMonth() === Number(month) - 1 &&
      date.getUTCDate() === Number(day)
      ? `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`
      : "";
  };
  if (iso) return validDate(iso[1], iso[2], iso[3]);
  const local = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (local) return validDate(local[3], local[2], local[1]);
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function parseDelimited(text: string) {
  const delimiter = (text.split(/\r?\n/, 1)[0]?.split(";").length ?? 0) >
      (text.split(/\r?\n/, 1)[0]?.split(",").length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}

function toRecords(rows: unknown[][]) {
  const stringifyCell = (cell: unknown) => {
    if (cell == null) return "";
    if (cell instanceof Date) return cell.toISOString();
    if (typeof cell === "string") return cell.trim();
    if (typeof cell === "number" || typeof cell === "boolean") {
      return String(cell).trim();
    }
    return "";
  };
  const [headers = [], ...data] = rows;
  const keys = headers.map((header) => normalizeKey(stringifyCell(header)));
  return data.filter((row) => row.some((cell) => stringifyCell(cell))).map((row) =>
    Object.fromEntries(keys.map((key, index) => [key, stringifyCell(row[index])])),
  );
}

export async function parseProjectPerformanceImport(
  file: File,
  project: { name: string; slug: string },
  aliases: string[],
): Promise<PerformanceImportPreview> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
  if (extension === "xls") throw new Error("Salve XLS antigo como XLSX ou CSV UTF-8.");
  const matrix = extension === "xlsx"
    ? (await readXlsxFile(file))[0]?.data ?? []
    : parseDelimited(await file.text());
  const records = toRecords(matrix);
  const acceptedNames = new Set([project.name, project.slug, ...aliases].map(normalizeIdentity));
  const hasProjectColumn = records.some((row) => PROJECT_KEYS.some((key) => key in row));
  const aggregate = new Map<string, PerformanceImportRow>();
  const issues: PerformanceImportPreview["issues"] = [];
  let considered = 0, ignored = 0, invalid = 0;

  for (const [index, record] of records.entries()) {
    const sourceRow = index + 2;
    const identity = pick(record, PROJECT_KEYS);
    if (hasProjectColumn && (!identity || !acceptedNames.has(normalizeIdentity(identity)))) {
      ignored += 1;
      issues.push({ row: sourceRow, kind: "ignored", reason: "Projeto/campanha não corresponde ao projeto selecionado." });
      continue;
    }
    const metric_date = parseDate(pick(record, DATE_KEYS));
    const spend = parseNumber(pick(record, SPEND_KEYS));
    const leads = parseNumber(pick(record, LEAD_KEYS));
    const group_joins = parseNumber(pick(record, GROUP_KEYS));
    const reach = parseNumber(pick(record, REACH_KEYS));
    if (!metric_date || [spend, leads, group_joins, reach].some(Number.isNaN)) {
      invalid += 1;
      issues.push({ row: sourceRow, kind: "invalid", reason: !metric_date ? "Data inválida." : "Valor numérico inválido." });
      continue;
    }
    considered += 1;
    const current = aggregate.get(metric_date) ?? {
      metric_date, spend: 0, leads: 0, group_joins: 0, reach: 0, notes: null,
    };
    current.spend += spend;
    current.leads += Math.trunc(leads);
    current.group_joins += Math.trunc(group_joins);
    current.reach += Math.trunc(reach);
    current.notes = [current.notes, pick(record, NOTES_KEYS)].filter(Boolean).join(" | ") || null;
    aggregate.set(metric_date, current);
  }

  return {
    rows: [...aggregate.values()].sort((a, b) => a.metric_date.localeCompare(b.metric_date)),
    considered,
    ignored,
    invalid,
    hasProjectColumn,
    issues,
  };
}
