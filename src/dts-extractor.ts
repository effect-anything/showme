import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type {
  DtsGenerationResult,
  ExtractEntry,
  ExtractKind,
  PipelineResult,
  ResolvedTargetInput,
} from "./core-types.ts";

interface DtsDocument {
  readonly filePath: string;
  readonly content: string;
  readonly sourceLineMap?: Readonly<Record<number, number>> | undefined;
}

const declarationKinds = new Set<ExtractKind>([
  "declarations",
  "signatures",
  "interfaces",
  "types",
  "variables",
  "imports",
  "exports",
]);

const sourcePathFromDtsPath = (fileName: string): string => fileName.replace(/\.d\.ts$/u, ".ts");

const toDocuments = (
  result: DtsGenerationResult,
  fileFilters: ReadonlyArray<string>,
): ReadonlyArray<DtsDocument> => {
  const normalizedFilters = fileFilters
    .map((filter) => filter.trim())
    .filter((filter) => filter.length > 0);
  const documents = result.results.map((item) => ({
    filePath: sourcePathFromDtsPath(item.fileName),
    content: item.content.trimEnd(),
    sourceLineMap: item.sourceLineMap,
  }));
  if (normalizedFilters.length === 0) return documents;
  return documents.filter((document) =>
    normalizedFilters.some(
      (filter) => document.filePath.includes(filter) || document.content.includes(filter),
    ),
  );
};

const lineKind = (line: string): ExtractKind | undefined => {
  const trimmed = line.trimStart();
  if (trimmed !== line) return undefined;
  if (trimmed.startsWith("import ")) return "imports";
  if (trimmed.startsWith("export interface ")) return "interfaces";
  if (trimmed.startsWith("export type ")) return "types";
  if (
    trimmed.startsWith("export declare const ") ||
    trimmed.startsWith("export declare let ") ||
    trimmed.startsWith("export declare var ")
  )
    return "variables";
  if (
    trimmed.startsWith("export declare function ") ||
    trimmed.startsWith("export declare class ") ||
    trimmed.startsWith("export declare abstract class ")
  )
    return "signatures";
  if (trimmed.startsWith("export declare namespace ")) return "exports";
  if (trimmed.startsWith("export ")) return "exports";
  return undefined;
};

const collectBlock = (
  lines: ReadonlyArray<string>,
  startIndex: number,
): { readonly text: string; readonly endIndex: number } => {
  const first = lines[startIndex] ?? "";
  if (!first.includes("{") || first.trimEnd().endsWith(";"))
    return { text: first, endIndex: startIndex };

  let depth = 0;
  const block: Array<string> = [];
  for (let index = startIndex; index < lines.length; index++) {
    const line = lines[index] ?? "";
    block.push(line);
    for (const char of line) {
      if (char === "{") depth += 1;
      if (char === "}") depth -= 1;
    }
    if (depth <= 0 && index > startIndex) return { text: block.join("\n"), endIndex: index };
  }
  return { text: block.join("\n"), endIndex: lines.length - 1 };
};

const makeEntry = (
  document: DtsDocument,
  kind: ExtractKind,
  lineIndex: number,
  text: string,
): ExtractEntry => ({
  kind,
  language: "typescript",
  filePath: document.filePath,
  line: document.sourceLineMap?.[lineIndex + 1] ?? lineIndex + 1,
  column: 1,
  sourcePos: lineIndex,
  text,
});

const extractDocument = (
  document: DtsDocument,
  requestedKinds: ReadonlySet<ExtractKind>,
): ReadonlyArray<ExtractEntry> => {
  const lines = document.content.split(/\r?\n/u);
  const entries: Array<ExtractEntry> = [];
  for (let index = 0; index < lines.length; index++) {
    const kind = lineKind(lines[index] ?? "");
    if (kind == null || !requestedKinds.has(kind)) continue;
    const block = collectBlock(lines, index);
    entries.push(makeEntry(document, kind, index, block.text));
    index = block.endIndex;
  }
  return entries;
};

export class DtsExtractor extends Context.Service<
  DtsExtractor,
  {
    readonly extract: (options: {
      readonly target: ResolvedTargetInput;
      readonly dts: DtsGenerationResult;
      readonly kind: ReadonlyArray<ExtractKind>;
    }) => Effect.Effect<PipelineResult>;
  }
>()("showme/DtsExtractor") {
  static readonly layer = Layer.succeed(this, {
    extract: (options) =>
      Effect.sync(() => {
        const requestedKinds = new Set(options.kind.filter((kind) => declarationKinds.has(kind)));
        const documents = toDocuments(options.dts, options.target.fileFilters);
        const entries = documents.flatMap((document) => extractDocument(document, requestedKinds));
        return {
          files: documents.map((document) => ({
            path: document.filePath,
            displayPath: document.filePath,
            language: "typescript" as const,
          })),
          entries,
          warnings: [],
        };
      }),
  });
}
