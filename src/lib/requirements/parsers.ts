import * as XLSX from "xlsx";
import * as mammoth from "mammoth";

export interface ParsedRequirementItem {
  requirementKey?: string;
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  module?: string;
  feature?: string;
  component?: string;
  priority?: string;
  status?: string;
  language?: "English" | "Arabic" | "Mixed";
  sourceFile: string;
  sourceRow?: number;
}

// Simple ratio-based language detection
export function detectLanguage(text: string): "English" | "Arabic" | "Mixed" {
  if (!text) return "English";
  const arabicRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/g;
  const matches = text.match(arabicRegex);
  const arabicCount = matches ? matches.length : 0;
  
  const totalAlpha = text.replace(/[^a-zA-Z\u0600-\u06FF]/g, "").length;
  if (totalAlpha === 0) return "English";
  
  const arabicRatio = arabicCount / totalAlpha;
  if (arabicRatio > 0.7) return "Arabic";
  if (arabicRatio > 0.1) return "Mixed";
  return "English";
}

// Maps spreadsheet columns dynamically
function findColumnIndex(headers: string[], possibleNames: string[]): number {
  return headers.findIndex((header) => {
    const cleaned = header.toLowerCase().replace(/[\s\-_]/g, "");
    return possibleNames.some((name) => {
      const cleanedName = name.toLowerCase().replace(/[\s\-_]/g, "");
      return cleaned === cleanedName || cleaned.includes(cleanedName) || cleanedName.includes(cleaned);
    });
  });
}

// Parse Excel / CSV files
export async function parseExcelOrCsv(fileBuffer: Buffer, fileName: string): Promise<ParsedRequirementItem[]> {
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

  if (rawData.length === 0) {
    throw new Error("The selected spreadsheet is empty.");
  }

  const headers = (rawData[0] as string[]).map((h) => String(h || "").trim());
  const dataRows = rawData.slice(1);

  // Column name mapping dictionaries
  const keyNames = ["requirementid", "requirement key", "req id", "id", "key", "رقم المتطلب", "رمز", "معرف", "متطلب رقم"];
  const titleNames = ["title", "name", "user story", "story", "requirement", "عنوان", "قصة المستخدم", "اسم", "المتطلب"];
  const descNames = ["description", "desc", "details", "الوصف", "وصف", "التفاصيل"];
  const acNames = ["acceptance criteria", "ac", "scenarios", "criteria", "معايير القبول", "شروط القبول", "شروط", "سيناريو"];
  const moduleNames = ["module", "section", "الوحدة", "القسم"];
  const featureNames = ["feature", "الميزة", "الخاصية"];
  const componentNames = ["component", "المكون"];
  const priorityNames = ["priority", "الأولوية", "اولوية"];
  const statusNames = ["status", "الحالة", "حالة"];

  let keyCol = findColumnIndex(headers, keyNames);
  let titleCol = findColumnIndex(headers, titleNames);
  let descCol = findColumnIndex(headers, descNames);
  let acCol = findColumnIndex(headers, acNames);
  let moduleCol = findColumnIndex(headers, moduleNames);
  let featureCol = findColumnIndex(headers, featureNames);
  let componentCol = findColumnIndex(headers, componentNames);
  let priorityCol = findColumnIndex(headers, priorityNames);
  let statusCol = findColumnIndex(headers, statusNames);

  // Intelligent column detection fallback if title or key not matched
  if (titleCol === -1) {
    // Look for first column with substantial text
    titleCol = headers.findIndex((h) => h.toLowerCase().includes("title") || h.toLowerCase().includes("name") || h.toLowerCase().includes("story")) ?? 0;
    if (titleCol === -1 && headers.length > 0) titleCol = 0;
  }

  const parsedItems: ParsedRequirementItem[] = [];

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based index plus header row
    if (!row || row.length === 0) return;

    let reqKey = keyCol !== -1 ? String(row[keyCol] || "").trim() : "";
    const title = titleCol !== -1 ? String(row[titleCol] || "").trim() : "";
    const description = descCol !== -1 ? String(row[descCol] || "").trim() : "";
    
    // Parse acceptance criteria (could be bullet points or newline-separated values)
    const rawAc = acCol !== -1 ? String(row[acCol] || "").trim() : "";
    const acceptanceCriteria = rawAc
      ? rawAc.split(/\n+/).map((line) => line.replace(/^[\s*\-•]+/g, "").trim()).filter(Boolean)
      : [];

    const module = moduleCol !== -1 ? String(row[moduleCol] || "").trim() : undefined;
    const feature = featureCol !== -1 ? String(row[featureCol] || "").trim() : undefined;
    const component = componentCol !== -1 ? String(row[componentCol] || "").trim() : undefined;
    const priority = priorityCol !== -1 ? String(row[priorityCol] || "").trim() : undefined;
    const status = statusCol !== -1 ? String(row[statusCol] || "").trim() : undefined;

    if (!title) return; // skip rows with no title

    // Generate a key if not specified
    if (!reqKey) {
      reqKey = `REQ-ROW-${rowNum}`;
    }

    const textToDetect = `${title} ${description} ${rawAc}`;
    const language = detectLanguage(textToDetect);

    parsedItems.push({
      requirementKey: reqKey,
      title,
      description: description || undefined,
      acceptanceCriteria,
      module: module || undefined,
      feature: feature || undefined,
      component: component || undefined,
      priority: priority || undefined,
      status: status || undefined,
      language,
      sourceFile: fileName,
      sourceRow: rowNum,
    });
  });

  return parsedItems;
}

// Parse Word (.docx) documents
export async function parseDocx(fileBuffer: Buffer, fileName: string): Promise<ParsedRequirementItem[]> {
  const result = await mammoth.extractRawText({ buffer: fileBuffer });
  const text = result.value;
  return parseTextOrMarkdown(text, fileName);
}

// Parse Plain Text (.txt, .md) documents
export function parseTextOrMarkdown(text: string, fileName: string): ParsedRequirementItem[] {
  const lines = text.split(/\r?\n/);
  const parsedItems: ParsedRequirementItem[] = [];

  let currentReq: Partial<ParsedRequirementItem> & { rawAcLines?: string[] } = {};
  let sectionModule: string | undefined;
  let sectionFeature: string | undefined;
  let sectionComponent: string | undefined;
  let inAcBlock = false;

  const pushCurrentReq = () => {
    if (currentReq.title) {
      if (currentReq.rawAcLines && currentReq.rawAcLines.length > 0) {
        currentReq.acceptanceCriteria = currentReq.rawAcLines
          .map((line) => line.replace(/^[\s*\-•\d.]+/g, "").trim())
          .filter(Boolean);
      }
      
      const reqText = `${currentReq.title} ${currentReq.description || ""} ${(currentReq.acceptanceCriteria || []).join(" ")}`;
      currentReq.language = detectLanguage(reqText);
      currentReq.sourceFile = fileName;
      currentReq.module = currentReq.module || sectionModule;
      currentReq.feature = currentReq.feature || sectionFeature;
      currentReq.component = currentReq.component || sectionComponent;

      parsedItems.push(currentReq as ParsedRequirementItem);
    }
    currentReq = {};
    inAcBlock = false;
  };

  const cleanHeader = (prefix: string, line: string) => {
    return line.slice(prefix.length).trim().replace(/^[:\s\-]+/, "").trim();
  };

  lines.forEach((line, idx) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    // Detect section folder tags
    if (trimmedLine.toLowerCase().startsWith("module:") || trimmedLine.startsWith("الوحدة:")) {
      sectionModule = cleanHeader("module:", trimmedLine);
      return;
    }
    if (trimmedLine.toLowerCase().startsWith("feature:") || trimmedLine.startsWith("الميزة:")) {
      sectionFeature = cleanHeader("feature:", trimmedLine);
      return;
    }
    if (trimmedLine.toLowerCase().startsWith("component:") || trimmedLine.startsWith("المكون:")) {
      sectionComponent = cleanHeader("component:", trimmedLine);
      return;
    }

    // Detect new Requirement Key or Title
    const reqKeyMatch = trimmedLine.match(/^\[?(REQ-\d+|REQ-[A-Z0-9\-]+)\]?[:\s]+(.*)/i);
    const storyMatch = trimmedLine.toLowerCase().startsWith("user story:") || trimmedLine.startsWith("قصة المستخدم:");
    const reqPrefixMatch = trimmedLine.toLowerCase().startsWith("requirement:") || trimmedLine.startsWith("متطلب:");

    if (reqKeyMatch || storyMatch || reqPrefixMatch) {
      pushCurrentReq(); // save previous one
      
      if (reqKeyMatch) {
        currentReq.requirementKey = reqKeyMatch[1].toUpperCase();
        currentReq.title = reqKeyMatch[2].trim();
      } else if (storyMatch) {
        currentReq.title = cleanHeader("user story:", trimmedLine);
      } else {
        currentReq.title = cleanHeader("requirement:", trimmedLine);
      }
      currentReq.sourceRow = idx + 1;
      return;
    }

    // Detect Priority
    if (trimmedLine.toLowerCase().startsWith("priority:") || trimmedLine.startsWith("الأولوية:") || trimmedLine.startsWith("اولوية:")) {
      const priorityVal = cleanHeader("priority:", trimmedLine);
      currentReq.priority = priorityVal;
      return;
    }

    // Detect Acceptance Criteria Block start
    if (
      trimmedLine.toLowerCase().startsWith("acceptance criteria:") ||
      trimmedLine.toLowerCase().startsWith("ac:") ||
      trimmedLine.startsWith("معايير القبول:") ||
      trimmedLine.startsWith("شروط القبول:")
    ) {
      inAcBlock = true;
      currentReq.rawAcLines = [];
      const trailingAc = cleanHeader("acceptance criteria:", trimmedLine);
      if (trailingAc) {
        currentReq.rawAcLines.push(trailingAc);
      }
      return;
    }

    // If inside AC block and line starts with a list item indicator
    if (inAcBlock && (/^[•\-\*\d+\.\u0623-\u064A]/.test(trimmedLine) || trimmedLine.length > 0)) {
      if (!currentReq.rawAcLines) currentReq.rawAcLines = [];
      currentReq.rawAcLines.push(trimmedLine);
      return;
    }

    // Otherwise treat as part of description
    if (currentReq.title) {
      inAcBlock = false;
      currentReq.description = currentReq.description
        ? `${currentReq.description}\n${trimmedLine}`
        : trimmedLine;
    } else {
      // Fallback: If no active requirement exists, short non-list lines act as titles
      if (trimmedLine.length < 100 && !trimmedLine.includes(":") && !trimmedLine.startsWith("-")) {
        pushCurrentReq();
        currentReq.title = trimmedLine;
        currentReq.sourceRow = idx + 1;
      }
    }
  });

  pushCurrentReq(); // save final requirement

  return parsedItems;
}

// Router main entry point for file parsing
export async function parseRequirementsFile(
  fileBuffer: Buffer,
  fileName: string,
  fileType: string
): Promise<ParsedRequirementItem[]> {
  const ext = fileType.toLowerCase();
  
  if (ext === "xlsx" || ext === "xls" || ext === "csv" || fileName.endsWith(".xlsx") || fileName.endsWith(".xls") || fileName.endsWith(".csv")) {
    return parseExcelOrCsv(fileBuffer, fileName);
  }
  if (ext === "docx" || fileName.endsWith(".docx")) {
    return parseDocx(fileBuffer, fileName);
  }
  if (ext === "txt" || ext === "md" || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    const text = fileBuffer.toString("utf-8");
    return parseTextOrMarkdown(text, fileName);
  }

  throw new Error(`Unsupported file type: ${fileType}. Supported types: .xlsx, .xls, .csv, .docx, .txt, .md`);
}
