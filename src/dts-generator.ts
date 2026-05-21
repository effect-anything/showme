import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type { DtsGenerationResult, DtsResult } from "./core-types.ts";
import { ShowmeError } from "./core-types.ts";
import { buildSourceLineMap } from "./source-map.ts";

const getTsgoPath = (): string => {
  const binary = process.env["TSGO"];
  if (binary != null && binary.length > 0) return binary;
  return "npx";
};

const getTsgoArgs = (tsgoPath: string): ReadonlyArray<string> => {
  if (tsgoPath === "npx") return ["tsgo"];
  return [];
};

const collectDts: (
  dir: string,
  cacheDir: string,
  results: Array<DtsResult>,
) => Effect.Effect<void, ShowmeError, FileSystem.FileSystem | Path.Path> = Effect.fnUntraced(
  function* (dir: string, cacheDir: string, results: Array<DtsResult>) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const exists = yield* fs
      .exists(dir)
      .pipe(
        Effect.mapError((cause) => new ShowmeError({ message: `Failed to inspect ${dir}`, cause })),
      );
    if (!exists) return;

    const entries = yield* fs
      .readDirectory(dir)
      .pipe(
        Effect.mapError((cause) => new ShowmeError({ message: `Failed to read ${dir}`, cause })),
      );

    for (const name of entries) {
      const fullPath = path.join(dir, name);
      const info = yield* fs
        .stat(fullPath)
        .pipe(
          Effect.mapError(
            (cause) => new ShowmeError({ message: `Failed to stat ${fullPath}`, cause }),
          ),
        );
      if (info.type === "Directory" && name !== "node_modules") {
        yield* collectDts(fullPath, cacheDir, results);
      } else if (name.endsWith(".d.ts")) {
        const content = yield* fs
          .readFileString(fullPath)
          .pipe(
            Effect.mapError(
              (cause) => new ShowmeError({ message: `Failed to read ${fullPath}`, cause }),
            ),
          );
        const mapPath = `${fullPath}.map`;
        const sourceLineMap = yield* fs.exists(mapPath).pipe(
          Effect.flatMap((exists) =>
            exists
              ? fs.readFileString(mapPath).pipe(
                  Effect.map((mapContent) => buildSourceLineMap(content, mapContent)),
                  Effect.catch(() => Effect.succeed(undefined)),
                )
              : Effect.succeed(undefined),
          ),
          Effect.mapError(
            (cause) => new ShowmeError({ message: `Failed to read ${mapPath}`, cause }),
          ),
        );
        results.push({ fileName: path.relative(cacheDir, fullPath), content, sourceLineMap });
      }
    }
  },
);

const formatTsgoCause = (cause: unknown): string => {
  if (cause instanceof Error) {
    const errorWithOutput = cause as Error & {
      readonly stdout?: unknown;
      readonly stderr?: unknown;
    };
    const stderr = typeof errorWithOutput.stderr === "string" ? errorWithOutput.stderr.trim() : "";
    const stdout = typeof errorWithOutput.stdout === "string" ? errorWithOutput.stdout.trim() : "";
    return [cause.message, stderr, stdout].filter((item) => item.length > 0).join("\n");
  }
  return String(cause);
};

export class DtsGenerator extends Context.Service<
  DtsGenerator,
  {
    readonly generate: (options: {
      readonly rootDir: string;
      readonly workspaceRoot?: string | undefined;
      readonly tsconfig?: string | undefined;
    }) => Effect.Effect<DtsGenerationResult, ShowmeError, FileSystem.FileSystem | Path.Path>;
  }
>()("showme/DtsGenerator") {
  static readonly layer = Layer.succeed(this, {
    generate: Effect.fnUntraced(function* (options: {
      readonly rootDir: string;
      readonly workspaceRoot?: string | undefined;
      readonly tsconfig?: string | undefined;
    }) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const rootDir = path.resolve(options.rootDir);
      const workspaceRoot = path.resolve(options.workspaceRoot ?? rootDir);
      const cacheDirName = createHash("sha256")
        .update(`${rootDir}\u0000${options.tsconfig ?? ""}`)
        .digest("hex");
      const cacheDir = path.join(
        workspaceRoot,
        "node_modules",
        ".cache",
        "showme-dts",
        cacheDirName,
      );
      yield* fs
        .makeDirectory(cacheDir, { recursive: true })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ShowmeError({ message: `Failed to create DTS cache ${cacheDir}`, cause }),
          ),
        );

      const tsconfig = options.tsconfig ?? path.join(rootDir, "tsconfig.json");
      const hasTsconfig = yield* fs
        .exists(tsconfig)
        .pipe(
          Effect.mapError(
            (cause) => new ShowmeError({ message: `Failed to inspect ${tsconfig}`, cause }),
          ),
        );
      const start = yield* Clock.currentTimeMillis;
      yield* Effect.try({
        try: () => {
          const tsgoPath = getTsgoPath();
          const args = [
            ...getTsgoArgs(tsgoPath),
            "--noEmit",
            "false",
            "--declaration",
            "--declarationMap",
            "--emitDeclarationOnly",
            "--incremental",
            "--tsBuildInfoFile",
            path.join(cacheDir, ".tsbuildinfo"),
            "--outDir",
            cacheDir,
            "--rootDir",
            rootDir,
            "--noCheck",
            "--skipLibCheck",
            ...(hasTsconfig ? ["-p", tsconfig] : []),
          ];
          execFileSync(tsgoPath, args, { cwd: workspaceRoot, stdio: "pipe", encoding: "utf-8" });
        },
        catch: (cause) =>
          new ShowmeError({
            message: `tsgo declaration generation failed for ${rootDir}${hasTsconfig ? ` using ${tsconfig}` : ""}\n${formatTsgoCause(cause)}`,
            cause,
          }),
      });
      const end = yield* Clock.currentTimeMillis;

      const results: Array<DtsResult> = [];
      yield* collectDts(cacheDir, cacheDir, results);
      return {
        results: results.sort((left, right) => left.fileName.localeCompare(right.fileName)),
        cacheDir,
        elapsedMillis: end - start,
      };
    }),
  });
}

export const formatDtsResults = (result: DtsGenerationResult): string =>
  result.results
    .map((item) => `// ${item.fileName.replace(/\.d\.ts$/u, ".ts")}\n${item.content.trimEnd()}\n`)
    .join("\n");
