import { extractFromText } from "./extract";
import type { ExtractedRecord } from "./types";

const CONTEXT =
  import.meta.env.VITE_ASSISTANT_CONTEXT ||
  "SubLedger monitors every subcontractor COI, licence, W-9 and bond expiry so non-compliance surfaces before it becomes a claim.";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";
const MODEL = "deepseek-v4-flash";

export interface AssistantReply {
  content: string;
  records?: ExtractedRecord[];
  source: "deepseek" | "local";
}

const SYSTEM_PROMPT = `You are the SubLedger compliance assistant. Context: ${CONTEXT}
You help construction subcontractor compliance teams reason about certificates of insurance (COI), licences, W-9s, bonds, waivers and lien documents.
When asked to extract records from pasted documents, reply with a short summary followed by a JSON array inside a fenced code block. Each object must have: title (the named insured or subcontractor legal name, never a document type), status (one of: expired:critical, expiring_soon:warning, non_compliant:critical, blocked:critical, compliant:good, awaiting_upload:warning, flagged:warning, pending_review:info, unverified:warning, missing_coverage:critical, partial:warning, valid:good, not_required:good), details (object, no due_date key), due_date (ISO string or null).`;

function localReply(message: string): AssistantReply {
  const lower = message.toLowerCase();
  const looksLikeDocument =
    /\b(insurance|certificate|coi|policy|insured|w-\?9|licen[cs]e|bond|expir|expires)\b/i.test(
      message
    ) || message.includes(",");
  if (looksLikeDocument) {
    const records = extractFromText(message);
    return {
      source: "local",
      records,
      content: `I parsed ${records.length} record${
        records.length === 1 ? "" : "s"
      } from that text. Review the extracted fields below and save them to the ledger.`,
    };
  }
  if (lower.includes("expir")) {
    return {
      source: "local",
      content:
        "Anything with a status of Expiring soon or Expired is shown in red or amber on the Subcontractors page. Sort by the expiry column to work the nearest deadlines first.",
    };
  }
  if (lower.includes("upload") || lower.includes("import")) {
    return {
      source: "local",
      content:
        "Go to Upload, drop a COI, licence, W-9 or CSV export. SubLedger reads the named insured and every expiry date it can find, then shows you the staged rows before you commit them.",
    };
  }
  return {
    source: "local",
    content:
      "I can explain compliance statuses, summarise your ledger, or extract records from pasted document text. Paste a certificate or CSV and I will turn it into structured rows.",
  };
}

export async function askAssistant(
  message: string,
  history: { role: "user" | "assistant"; content: string }[]
): Promise<AssistantReply> {
  const key = import.meta.env.VITE_DEEPSEEK_API_KEY;
  if (!key) return localReply(message);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history.slice(-6),
          { role: "user", content: message },
        ],
      }),
    });
    if (!res.ok) throw new Error(`DeepSeek ${res.status}`);
    const json = await res.json();
    const content: string = json?.choices?.[0]?.message?.content ?? "";
    if (!content) return localReply(message);
    const records = extractJsonArray(content);
    return { content, records, source: "deepseek" };
  } catch {
    return localReply(message);
  }
}

function extractJsonArray(content: string): ExtractedRecord[] | undefined {
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start === -1 || end === -1) return undefined;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    if (!Array.isArray(parsed) || !parsed.length) return undefined;
    return parsed
      .filter((r) => r && typeof r === "object")
      .map((r) => ({
        title: String(r.title ?? "Unknown Entity"),
        status: r.status ?? "pending_review:info",
        details: r.details && typeof r.details === "object" ? r.details : {},
        due_date: r.due_date ?? null,
      }));
  } catch {
    return undefined;
  }
}
