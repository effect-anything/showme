import * as Data from "effect/Data";

export type LanguageId = "typescript";

export type ExtractKind =
  | "all"
  | "signatures"
  | "interfaces"
  | "types"
  | "variables"
  | "imports"
  | "exports"
  | "declarations";

export type OutputFormat = "plain" | "markdown";

export interface TargetInput {
  readonly paths: ReadonlyArray<string>;
}

export interface ResolvedTargetInput extends TargetInput {
  readonly workspaceRoot: string;
  readonly rootDir: string;
  readonly tsconfig?: string | undefined;
  readonly fileFilters: ReadonlyArray<string>;
}

export interface DiscoveredFile {
  readonly path: string;
  readonly displayPath: string;
  readonly language: LanguageId;
}

export interface ExtractEntry {
  readonly kind: ExtractKind;
  readonly language: LanguageId;
  readonly filePath: string;
  readonly line: number;
  readonly column: number;
  readonly sourcePos?: number;
  readonly name?: string;
  readonly text: string;
}

export interface ExtractWarning {
  readonly filePath: string;
  readonly message: string;
}

export interface PipelineOptions {
  readonly input: TargetInput;
  readonly kind: ReadonlyArray<ExtractKind>;
  readonly fileFilters: ReadonlyArray<string>;
  readonly lineNumber: boolean;
  readonly format: OutputFormat;
}

export interface CliOptions extends PipelineOptions {
  readonly output?: string | undefined;
}

export interface PipelineResult {
  readonly files: ReadonlyArray<DiscoveredFile>;
  readonly entries: ReadonlyArray<ExtractEntry>;
  readonly warnings: ReadonlyArray<ExtractWarning>;
}

export interface DtsResult {
  readonly fileName: string;
  readonly content: string;
  readonly sourceLineMap?: Readonly<Record<number, number>> | undefined;
}

export interface DtsGenerationResult {
  readonly results: ReadonlyArray<DtsResult>;
  readonly cacheDir: string;
  readonly elapsedMillis: number;
}

export class ShowmeError extends Data.TaggedError("ShowmeError")<{
  message: string;
  cause?: unknown;
}> {}
