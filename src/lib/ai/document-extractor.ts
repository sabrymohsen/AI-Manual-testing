import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export interface ExtractedDocument {
  text: string;
  fileName: string;
  fileType: string;
  pageCount?: number;
  wordCount: number;
  sections: DocumentSection[];
}

export interface DocumentSection {
  title: string;
  content: string;
  level: number; // h1=1, h2=2, etc.
  lineNumber: number;
}

/**
 * Extract text from uploaded document (DOCX, PDF, TXT)
 */
export async function extractDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<ExtractedDocument> {
  let text: string;
  let pageCount: number | undefined;

  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    // pdf-parse v2 exposes a PDFParse class. The old call treated the module
    // as v1's function, which threw "not a function" for every PDF.
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      // v2 appends "-- 1 of 3 --" page markers; they aren't document text.
      text = result.text.replace(/^-- \d+ of \d+ --$/gm, "");
      pageCount = result.total;
    } finally {
      await parser.destroy().catch(() => {});
    }
  } else if (
    mimeType.includes("word") ||
    mimeType.includes("docx") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (
    mimeType.includes("text") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    text = buffer.toString("utf-8");
  } else {
    throw new Error(
      `Unsupported file type: ${mimeType}. Supported: PDF, DOCX, TXT, MD`
    );
  }

  // Clean up text
  text = cleanText(text);

  const sections = parseSections(text);
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

  return {
    text,
    fileName,
    fileType: mimeType,
    pageCount,
    wordCount,
    sections,
  };
}

/**
 * Extract requirements from structured text
 * Identifies numbered requirements, user stories, acceptance criteria, etc.
 */
export function extractRequirements(text: string): {
  requirements: RequirementItem[];
  summary: { total: number; byType: Record<string, number> };
} {
  const requirements: RequirementItem[] = [];
  const lines = text.split("\n");
  const byType: Record<string, number> = {};

  let currentRequirement: RequirementItem | null = null;
  let buffer: string[] = [];

  const reqPatterns = [
    // Arabic/English numbered requirements
    /^\s*(?:REQ|FR|NFR|SR|BR|UC)-?\d+[:\.]?\s*/i,
    /^\s*\d+[.\)]\s+/, // 1. or 1) requirement
    /^\s*(?:Requirement|Functional Requirement|Non-Functional Requirement|User Story|Acceptance Criteria|Business Rule|Use Case)[:\s]+/i,
    /^\s*ك.\w\s*[-:]\s*/, // Arabic requirement IDs
    /^\s*المتطلب\s*\d+[:\.]?\s*/i, // Arabic numbered
    /^\s*\d+\.\s*المتطلب[:\.]?\s*/i,
  ];

  const isRequirementLine = (line: string): boolean => {
    return reqPatterns.some((pattern) => pattern.test(line));
  };

  const saveCurrent = () => {
    if (currentRequirement && buffer.length > 0) {
      currentRequirement.description = buffer.join(" ").trim();
      if (currentRequirement.description.length > 20) {
        requirements.push(currentRequirement);
        const type = currentRequirement.type || "General";
        byType[type] = (byType[type] || 0) + 1;
      }
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (isRequirementLine(line)) {
      saveCurrent();
      currentRequirement = {
        id: `REQ-${requirements.length + 1}`,
        title: line.replace(/^\s*\d+[.\)]\s*/, "").substring(0, 200),
        description: "",
        type: detectRequirementType(line),
        priority: detectPriority(line),
        lineNumber: i + 1,
      };
      buffer = [];
    } else if (currentRequirement) {
      buffer.push(line);
    }
  }

  saveCurrent();

  // If no structured requirements found, treat entire text as one requirement
  if (requirements.length === 0 && text.length > 50) {
    const paragraphs = text
      .split(/\n\s*\n/)
      .filter((p) => p.trim().length > 30);
    for (let i = 0; i < Math.min(paragraphs.length, 50); i++) {
      const para = paragraphs[i].trim();
      requirements.push({
        id: `REQ-${i + 1}`,
        title: para.substring(0, 100).replace(/\n/g, " "),
        description: para,
        type: "General",
        priority: "Medium",
        lineNumber: i + 1,
      });
      byType["General"] = (byType["General"] || 0) + 1;
    }
  }

  return {
    requirements,
    summary: { total: requirements.length, byType },
  };
}

export interface RequirementItem {
  id: string;
  title: string;
  description: string;
  type: string;
  priority: string;
  lineNumber: number;
}

function detectRequirementType(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("functional")) return "Functional";
  if (lower.includes("non-functional") || lower.includes("performance") || lower.includes("security")) return "Non-Functional";
  if (lower.includes("user story")) return "User Story";
  if (lower.includes("acceptance")) return "Acceptance Criteria";
  if (lower.includes("business rule")) return "Business Rule";
  if (lower.includes("use case")) return "Use Case";
  return "Functional";
}

function detectPriority(line: string): string {
  const lower = line.toLowerCase();
  if (lower.includes("critical") || lower.includes("high priority")) return "Critical";
  if (lower.includes("high")) return "High";
  if (lower.includes("low")) return "Low";
  return "Medium";
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\t/g, " ")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .trim();
}

function parseSections(text: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = text.split("\n");
  let currentSection: DocumentSection | null = null;
  let buffer: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/); // Markdown headings
    const docHeadingMatch = line.match(/^\s*(\d+(?:\.\d+)*)\s*[.:\-]\s*(.+)$/); // Numbered headings

    if (headingMatch || docHeadingMatch) {
      if (currentSection && buffer.length > 0) {
        currentSection.content = buffer.join("\n").trim();
        sections.push(currentSection);
      }

      const title = headingMatch
        ? headingMatch[2].trim()
        : docHeadingMatch
        ? docHeadingMatch[2].trim()
        : line.trim();
      const level = headingMatch
        ? headingMatch[1].length
        : docHeadingMatch
        ? docHeadingMatch[1].split(".").length
        : 1;

      currentSection = {
        title,
        content: "",
        level,
        lineNumber: i + 1,
      };
      buffer = [];
    } else if (currentSection) {
      buffer.push(line);
    }
  }

  if (currentSection && buffer.length > 0) {
    currentSection.content = buffer.join("\n").trim();
    sections.push(currentSection);
  }

  // If no sections found, create one from entire text
  if (sections.length === 0 && text.length > 0) {
    sections.push({
      title: "Document Content",
      content: text,
      level: 1,
      lineNumber: 1,
    });
  }

  return sections;
}
