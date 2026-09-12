import fs from "node:fs/promises";
import path from "node:path";
import sanitizeHtml from "sanitize-html";

export const LIMITS = {
  video: 250 * 1024 * 1024,
  pdf: 25 * 1024 * 1024,
  html: 2 * 1024 * 1024,
};
export const TYPES = {
  ".mp4": { kind: "video", mime: "video/mp4" },
  ".pdf": { kind: "pdf", mime: "application/pdf" },
  ".html": { kind: "html", mime: "text/html" },
  ".htm": { kind: "html", mime: "text/html" },
};
export function problem(message, status = 400) {
  return Object.assign(new Error(message), { status });
}
export function metadata(body) {
  const field = (name, min, max) => {
    if (typeof body?.[name] !== "string")
      throw problem(`${name} must be text.`);
    const value = body[name].trim();
    if (value.length < min || value.length > max)
      throw problem(`${name} must contain ${min}–${max} characters.`);
    return value;
  };
  const title = field("title", 1, 160),
    description = field("description", 0, 3000),
    category = field("category", 1, 60);
  const tagText = body.tags ?? "";
  if (typeof tagText !== "string" || tagText.length > 250)
    throw problem("Tags must be comma-separated text, up to 250 characters.");
  const tags = [
    ...new Set(
      tagText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ];
  if (tags.length > 8 || tags.some((t) => t.length > 30))
    throw problem("Use up to 8 tags, each up to 30 characters.");
  return { title, description, category, tags };
}
export function htmlDocument(raw) {
  const content = sanitizeHtml(raw, {
    allowedTags: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "strong",
      "b",
      "em",
      "i",
      "u",
      "s",
      "blockquote",
      "pre",
      "code",
      "ul",
      "ol",
      "li",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "caption",
      "div",
      "span",
      "section",
      "article",
      "header",
      "footer",
      "dl",
      "dt",
      "dd",
      "sub",
      "sup",
    ],
    allowedAttributes: {
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
    },
    allowedSchemes: [],
    nonTextTags: ["script", "style", "textarea", "option", "noscript"],
    disallowedTagsMode: "discard",
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>body{font:17px/1.75 system-ui,sans-serif;color:#24352f;max-width:800px;margin:auto;padding:36px}h1,h2,h3{line-height:1.25;color:#143f30}h1{font-size:34px}h2{margin-top:2em}pre,blockquote{padding:20px;background:#f1f5f2;border-radius:8px;overflow:auto}table{border-collapse:collapse;max-width:100%;display:block;overflow:auto}td,th{padding:12px;border:1px solid #dbe3dd}code{overflow-wrap:anywhere}p,li{overflow-wrap:anywhere}</style></head><body>${content}</body></html>`;
}
export async function validateFile(file) {
  if (!file) throw problem("Choose an MP4, PDF, or HTML file.");
  const type = TYPES[path.extname(file.originalname).toLowerCase()];
  if (!type)
    throw problem("Unsupported file. Only MP4, PDF, and HTML are accepted.");
  if (file.size < 1 || file.size > LIMITS[type.kind])
    throw problem(
      `${type.kind.toUpperCase()} files must be nonempty and no larger than ${LIMITS[type.kind] / 1024 / 1024} MB.`,
    );
  const handle = await fs.open(file.path, "r");
  const header = Buffer.alloc(16);
  try {
    await handle.read(header, 0, 16, 0);
  } finally {
    await handle.close();
  }
  if (
    type.kind === "pdf" &&
    !header.subarray(0, 5).equals(Buffer.from("%PDF-"))
  )
    throw problem("This file is not a valid PDF.");
  if (type.kind === "video" && header.toString("ascii", 4, 8) !== "ftyp")
    throw problem("This file is not an MP4 container.");
  if (type.kind === "html") {
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(
        await fs.readFile(file.path),
      );
    } catch {
      throw problem("HTML must be valid UTF-8 text.");
    }
    if (
      text.includes("\0") ||
      !/<(?:!doctype\s+html|html|body|h[1-6]|p|div|section|article|ul|table)(?:\s|>)/i.test(
        text,
      )
    )
      throw problem(
        "The HTML file needs valid HTML content, such as a heading or paragraph.",
      );
    await fs.writeFile(file.path, htmlDocument(text), { mode: 0o600 });
  }
  return type;
}
export function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]))
    throw problem("Unsupported byte range.", 416);
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0)
      throw problem("Invalid byte range.", 416);
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  )
    throw problem("Invalid byte range.", 416);
  return { start, end };
}
export function publicItem(row, admin = false) {
  const {
    id,
    title,
    description,
    category,
    kind,
    size,
    created_at,
    updated_at,
  } = row;
  return {
    id,
    title,
    description,
    category,
    kind,
    size,
    created_at,
    updated_at,
    tags: JSON.parse(row.tags),
    ...(admin ? { opens: row.opens } : {}),
  };
}
