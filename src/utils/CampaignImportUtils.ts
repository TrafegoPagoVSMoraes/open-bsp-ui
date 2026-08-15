import readXlsxFile from "read-excel-file/browser";

export type CampaignImportRecord = {
  name: string;
  phone: string;
  email?: string;
  source: Record<string, string>;
};

export type CampaignImportPreview = {
  records: CampaignImportRecord[];
  invalid: number;
  duplicates: number;
  columns: string[];
};

const NAME_KEYS = ["nome", "name", "nome_completo", "full_name"];
const PHONE_KEYS = [
  "whatsapp",
  "telefone",
  "phone",
  "phone_number",
  "celular",
  "numero",
];
const EMAIL_KEYS = ["email", "e-mail"];
const LOWERCASE_PARTICLES = new Set(["da", "das", "de", "do", "dos", "e"]);

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, "_");
}

function normalizeName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((part, index) =>
      index > 0 && LOWERCASE_PARTICLES.has(part)
        ? part
        : part.charAt(0).toLocaleUpperCase("pt-BR") + part.slice(1),
    )
    .join(" ");
}

export function normalizeCampaignPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits.length >= 12 && digits.length <= 15 ? digits : "";
}

function parseDelimited(text: string, delimiter: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);

  const headers = (rows.shift() ?? []).map(normalizeKey);
  return rows.map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""])),
  );
}

function parseXml(text: string) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.querySelector("parsererror")) throw new Error("XML inválido.");
  const candidates = Array.from(document.querySelectorAll("contact, contato, row, item"));
  return candidates.map((node) =>
    Object.fromEntries(
      Array.from(node.children).map((child) => [normalizeKey(child.tagName), child.textContent?.trim() ?? ""]),
    ),
  );
}

function toStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      normalizeKey(key),
      item == null ? "" : typeof item === "object" ? JSON.stringify(item) : String(item).trim(),
    ]),
  );
}

function pick(record: Record<string, string>, keys: string[]) {
  return keys.map((key) => record[key]).find(Boolean) ?? "";
}

function spreadsheetRowsToRecords(rows: unknown[][]) {
  const stringifyCell = (cell: unknown) => {
    if (cell == null) return "";
    if (cell instanceof Date) return cell.toISOString();
    if (typeof cell === "string") return cell.trim();
    if (typeof cell === "number" || typeof cell === "boolean") {
      return String(cell).trim();
    }
    return "";
  };
  const [headerRow = [], ...dataRows] = rows;
  const headers = headerRow.map((cell) => normalizeKey(stringifyCell(cell)));

  return dataRows
    .filter((row) => row.some((cell) => stringifyCell(cell)))
    .map((row) =>
      Object.fromEntries(
        headers
          .map((header, index) => [header, stringifyCell(row[index])] as const)
          .filter(([header]) => header),
      ),
    );
}

export async function parseCampaignImport(file: File): Promise<CampaignImportPreview> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase() ?? "";
  let rawRecords: Record<string, string>[];
  if (extension === "xlsx") {
    const sheets = await readXlsxFile(file);
    rawRecords = spreadsheetRowsToRecords(sheets[0]?.data ?? []);
  } else if (extension === "xls") {
    throw new Error("O formato XLS antigo não é suportado. Salve a planilha como XLSX ou CSV UTF-8.");
  } else if (extension === "json") {
    const text = await file.text();
    const parsed: unknown = JSON.parse(text);
    const values = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as { contacts?: unknown[] }).contacts)
        ? (parsed as { contacts: unknown[] }).contacts
        : [];
    rawRecords = values.map(toStringRecord);
  } else if (extension === "xml") {
    rawRecords = parseXml(await file.text());
  } else {
    const text = await file.text();
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    rawRecords = parseDelimited(text, firstLine.split(";").length > firstLine.split(",").length ? ";" : ",");
  }

  const seen = new Set<string>();
  const records: CampaignImportRecord[] = [];
  let invalid = 0;
  let duplicates = 0;

  for (const source of rawRecords) {
    const phone = normalizeCampaignPhone(pick(source, PHONE_KEYS));
    if (!phone) {
      invalid += 1;
      continue;
    }
    if (seen.has(phone)) {
      duplicates += 1;
      continue;
    }
    seen.add(phone);
    const rawName = pick(source, NAME_KEYS);
    records.push({
      name: normalizeName(rawName),
      phone,
      email: pick(source, EMAIL_KEYS) || undefined,
      source,
    });
  }

  return {
    records,
    invalid,
    duplicates,
    columns: Array.from(new Set(rawRecords.flatMap((record) => Object.keys(record)))),
  };
}

export function firstName(name: string) {
  return name.trim().split(/\s+/, 1)[0] ?? "";
}
