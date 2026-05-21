import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type { ExtractEntry, OutputFormat, PipelineResult } from "./core-types.ts";

export interface FormatOptions {
  readonly lineNumber: boolean;
  readonly format: OutputFormat;
}

const REDACTED_UNSAFE = "[unsafe text omitted]";
const markdownMetaPattern = /[`<>]/gu;

const hasUnsafeControlCharacters = (value: string): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (
      (code >= 0 && code <= 8) ||
      code === 11 ||
      code === 12 ||
      (code >= 14 && code <= 31) ||
      code === 127
    )
      return true;
  }
  return false;
};

const hasAnsiEscape = (value: string): boolean => value.includes(String.fromCharCode(27));

const sanitizeForDisplay = (value: string): string => {
  if (hasAnsiEscape(value) || hasUnsafeControlCharacters(value)) return REDACTED_UNSAFE;
  return value;
};

const sanitizeForMarkdown = (value: string): string =>
  sanitizeForDisplay(value).replace(markdownMetaPattern, (char) => `\\${char}`);

const formatEntryLines = (entry: ExtractEntry, lineNumber: boolean): string => {
  const lines = entry.text.split(/\r?\n/u).map(sanitizeForDisplay);
  if (!lineNumber) return lines.join("\n");
  return [`// L${entry.line}`, ...lines].join("\n");
};

const formatPlainEntry = (entry: ExtractEntry, options: FormatOptions): string =>
  formatEntryLines(entry, options.lineNumber);

const formatPlain = (result: PipelineResult, options: FormatOptions): string => {
  const sections = new Map<string, Array<ExtractEntry>>();
  for (const entry of result.entries) {
    const current = sections.get(entry.filePath) ?? [];
    current.push(entry);
    sections.set(entry.filePath, current);
  }

  const parts: Array<string> = [];
  for (const [filePath, entries] of sections.entries()) {
    if (entries.length === 0) continue;
    parts.push(`// ${sanitizeForDisplay(filePath)}`);
    for (const entry of entries) parts.push(formatPlainEntry(entry, options));
    parts.push("");
  }
  return parts.join("\n").trimEnd();
};

const formatMarkdown = (result: PipelineResult, options: FormatOptions): string => {
  const sections = new Map<string, Array<ExtractEntry>>();
  for (const entry of result.entries) {
    const current = sections.get(entry.filePath) ?? [];
    current.push(entry);
    sections.set(entry.filePath, current);
  }

  return [...sections.entries()]
    .map(([filePath, entries]) => {
      const body = entries.map((entry) => formatPlainEntry(entry, options)).join("\n");
      return `## ${sanitizeForMarkdown(filePath)}\n\n\`\`\`\n${body.split(/\r?\n/u).map(sanitizeForMarkdown).join("\n")}\n\`\`\``;
    })
    .join("\n\n");
};

export class Formatter extends Context.Service<
  Formatter,
  {
    readonly format: (result: PipelineResult, options: FormatOptions) => Effect.Effect<string>;
  }
>()("showme/Formatter") {
  static readonly layer = Layer.succeed(this, {
    format: (result, options) =>
      Effect.succeed(
        options.format === "markdown"
          ? formatMarkdown(result, options)
          : formatPlain(result, options),
      ),
  });
}
