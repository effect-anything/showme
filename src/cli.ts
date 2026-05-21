import * as NodePath from "node:path";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Args from "effect/unstable/cli/Argument";
import * as Command from "effect/unstable/cli/Command";
import * as Flag from "effect/unstable/cli/Flag";
import picomatch from "picomatch";
import PackageJson from "../package.json" with { type: "json" };
import type {
  CliOptions,
  DtsGenerationResult,
  ExtractKind,
  ResolvedTargetInput,
  TargetInput,
} from "./core-types.ts";
import { DtsExtractor } from "./dts-extractor.ts";
import { DtsGenerator, formatDtsResults } from "./dts-generator.ts";
import { Formatter } from "./formatter.ts";
import { parsePnpmWorkspacePackages } from "./pnpm-workspace.ts";

const structuralFilters = [
  "signatures",
  "interfaces",
  "types",
  "variables",
  "imports",
  "exports",
] as const satisfies ReadonlyArray<ExtractKind>;

const kindChoices = [
  "all",
  "declarations",
  ...structuralFilters,
] as const satisfies ReadonlyArray<ExtractKind>;

const expandKind = (
  kinds: ReadonlyArray<(typeof kindChoices)[number]>,
): ReadonlyArray<ExtractKind> => (kinds.includes("all") ? structuralFilters : kinds);

const parseList = (values: ReadonlyArray<string>): ReadonlyArray<string> => [
  ...new Set(
    values.flatMap((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  ),
];

const parseKind = (
  values: ReadonlyArray<(typeof kindChoices)[number]>,
): ReadonlyArray<ExtractKind> => {
  const selected = [...new Set(values)];
  return expandKind(selected.length === 0 ? ["all"] : selected);
};

const sourcesToTargetInput = (sources: ReadonlyArray<string>): TargetInput => ({
  paths: sources.length === 0 ? ["."] : sources,
});

const tsconfigPreference = [
  "tsconfig.app.json",
  "tsconfig.lib.json",
  "tsconfig.check.json",
  "tsconfig.json",
] as const;

const projectTsconfigPreference = [
  "tsconfig.app.json",
  "tsconfig.lib.json",
  "tsconfig.check.json",
] as const;

const workspaceMarkers = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "bun.lockb",
  "bun.lock",
  "yarn.lock",
  "package-lock.json",
  "nx.json",
  "turbo.json",
  "lerna.json",
  ".git",
] as const;

const targetFileToFilter = (rootDir: string, filePath: string): string => {
  const normalizedRoot = rootDir.endsWith("/") ? rootDir : `${rootDir}/`;
  const relative = filePath.startsWith(normalizedRoot)
    ? filePath.slice(normalizedRoot.length)
    : filePath;
  return relative.replace(/\.[cm]?[jt]sx?$/u, ".ts");
};

const targetPathToFilters = (
  rootDir: string,
  absolutePath: string,
  isDirectory: boolean,
): ReadonlyArray<string> => {
  if (absolutePath === rootDir) return [];
  const normalizedPath = absolutePath.endsWith("/") ? absolutePath : `${absolutePath}/`;
  const normalizedRoot = rootDir.endsWith("/") ? rootDir : `${rootDir}/`;
  if (normalizedRoot.startsWith(normalizedPath)) return [];
  if (!absolutePath.startsWith(normalizedRoot)) return [];
  if (isDirectory) return [absolutePath.slice(normalizedRoot.length)];
  return [targetFileToFilter(rootDir, absolutePath)];
};

const ignoredProjectDirectories = new Set([
  "node_modules",
  "dist",
  "build",
  ".git",
  ".nx",
  ".direnv",
  ".repo",
  ".venv",
  ".wrangler",
  ".react-router",
  ".expo",
  "coverage",
  "scratchpad",
]);

const broadWorkspaceThreshold = 8;

const isSubpath = (parent: string, child: string): boolean => {
  const relative = NodePath.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !NodePath.isAbsolute(relative));
};

const workspaceGlobBase = (pattern: string): string | undefined => {
  if (pattern.startsWith("!")) return undefined;
  const segments = pattern.replaceAll("\\", "/").split("/");
  const baseSegments: Array<string> = [];
  for (const segment of segments) {
    if (segment.length === 0) continue;
    if (/[*?[{]/u.test(segment)) break;
    baseSegments.push(segment);
  }
  return baseSegments.length === 0 ? undefined : baseSegments.join("/");
};

const readWorkspacePackageRoots = (workspaceRoot: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const workspaceFile = path.join(workspaceRoot, "pnpm-workspace.yaml");
    const exists = yield* fs.exists(workspaceFile).pipe(Effect.result);
    if (Result.isFailure(exists) || !exists.success) return [] as ReadonlyArray<string>;

    const content = yield* fs.readFileString(workspaceFile).pipe(Effect.result);
    if (Result.isFailure(content)) return [] as ReadonlyArray<string>;

    const packageGlobs = parsePnpmWorkspacePackages(content.success);
    const roots = [] as Array<string>;
    for (const packageGlob of packageGlobs) {
      const base = workspaceGlobBase(packageGlob);
      if (base == null) continue;
      const absolute = path.join(workspaceRoot, base);
      const info = yield* fs.stat(absolute).pipe(Effect.result);
      if (Result.isSuccess(info) && info.success.type === "Directory") roots.push(absolute);
    }
    return [...new Set(roots)];
  });

const findWorkspaceRoot = (start: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = start;
    let best: string | undefined;
    while (true) {
      for (const marker of workspaceMarkers) {
        const exists = yield* fs.exists(path.join(current, marker)).pipe(Effect.result);
        if (Result.isSuccess(exists) && exists.success) {
          best = current;
          break;
        }
      }

      const parent = path.dirname(current);
      if (parent === current) return best ?? start;
      current = parent;
    }
  });

const findNearestExistingTsconfig = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const name of tsconfigPreference) {
      const candidate = path.join(directory, name);
      const exists = yield* fs.exists(candidate).pipe(Effect.result);
      if (Result.isSuccess(exists) && exists.success) return candidate;
    }
    return undefined;
  });

const findProjectTsconfig = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    for (const name of projectTsconfigPreference) {
      const candidate = path.join(directory, name);
      const exists = yield* fs.exists(candidate).pipe(Effect.result);
      if (Result.isSuccess(exists) && exists.success) return candidate;
    }
    return undefined;
  });

const collectProjectTsconfigs = (directory: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const results: Array<string> = [];

    const visit: (
      current: string,
    ) => Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> = Effect.fnUntraced(
      function* (current: string) {
        const localTsconfig = yield* findProjectTsconfig(current);
        if (localTsconfig != null) {
          results.push(localTsconfig);
          return;
        }

        const entries = yield* fs.readDirectory(current).pipe(Effect.result);
        if (Result.isFailure(entries)) return;

        for (const name of entries.success) {
          if (ignoredProjectDirectories.has(name)) continue;
          const fullPath = path.join(current, name);
          const info = yield* fs.stat(fullPath).pipe(Effect.result);
          if (Result.isSuccess(info) && info.success.type === "Directory") {
            yield* visit(fullPath);
          }
        }
      },
    );

    yield* visit(directory);
    return [...new Set(results)];
  });

const collectWorkspaceProjectTsconfigs = (workspaceRoot: string, sourceDirectory: string) =>
  Effect.gen(function* () {
    const packageRoots = yield* readWorkspacePackageRoots(workspaceRoot);
    if (packageRoots.length === 0) return yield* collectProjectTsconfigs(sourceDirectory);

    const results = [] as Array<string>;
    for (const packageRoot of packageRoots) {
      const searchRoot = isSubpath(packageRoot, sourceDirectory) ? sourceDirectory : packageRoot;
      if (!isSubpath(sourceDirectory, searchRoot) && !isSubpath(searchRoot, sourceDirectory))
        continue;
      results.push(...(yield* collectProjectTsconfigs(searchRoot)));
    }
    return [...new Set(results)];
  });

const findTsconfig = (startDirectory: string, cwd: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const workspaceRoot = yield* findWorkspaceRoot(startDirectory);
    let current = startDirectory;
    while (true) {
      const candidate = yield* findNearestExistingTsconfig(current);
      if (candidate != null) return candidate;

      const parent = path.dirname(current);
      if (parent === current || current === workspaceRoot) break;
      current = parent;
    }

    const workspaceTsconfig = yield* findNearestExistingTsconfig(workspaceRoot);
    if (workspaceTsconfig != null) return workspaceTsconfig;

    const cwdTsconfig = yield* findNearestExistingTsconfig(cwd);
    if (cwdTsconfig != null) return cwdTsconfig;

    return undefined;
  });

const resolveProjectScope = (sourcePath: string, isDirectory: boolean) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const cwd = path.resolve(".");
    const absolute = path.resolve(sourcePath);
    const startDirectory = isDirectory ? absolute : path.dirname(absolute);
    const tsconfig = yield* findTsconfig(startDirectory, cwd);
    const rootDir = tsconfig == null ? startDirectory : path.dirname(tsconfig);
    const workspaceRoot = yield* findWorkspaceRoot(rootDir);
    return { absolute, workspaceRoot, rootDir, tsconfig } as const;
  });

const resolveDirectorySource = (sourcePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const absolute = path.resolve(sourcePath);
    const workspaceRoot = yield* findWorkspaceRoot(absolute);
    const discoveredTsconfigs = yield* collectWorkspaceProjectTsconfigs(workspaceRoot, absolute);
    if (discoveredTsconfigs.length > 0) {
      const scopes = [] as Array<{
        readonly workspaceRoot: string;
        readonly rootDir: string;
        readonly tsconfig?: string | undefined;
        readonly fileFilters: ReadonlyArray<string>;
      }>;
      for (const tsconfig of discoveredTsconfigs) {
        const rootDir = path.dirname(tsconfig);
        const workspaceRoot = yield* findWorkspaceRoot(rootDir);
        scopes.push({
          workspaceRoot,
          rootDir,
          tsconfig,
          fileFilters: targetPathToFilters(rootDir, absolute, true),
        });
      }
      return scopes;
    }

    const localTsconfig = yield* findNearestExistingTsconfig(absolute);
    if (localTsconfig != null) {
      const rootDir = path.dirname(localTsconfig);
      const workspaceRoot = yield* findWorkspaceRoot(rootDir);
      return [
        {
          workspaceRoot,
          rootDir,
          tsconfig: localTsconfig,
          fileFilters: targetPathToFilters(rootDir, absolute, true),
        },
      ];
    }

    const scope = yield* resolveProjectScope(sourcePath, true);
    return [
      {
        workspaceRoot: scope.workspaceRoot,
        rootDir: scope.rootDir,
        tsconfig: scope.tsconfig,
        fileFilters: targetPathToFilters(scope.rootDir, scope.absolute, true),
      },
    ];
  });

const resolveSource = (sourcePath: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const absolute = path.resolve(sourcePath);
    const info = yield* fs.stat(absolute).pipe(Effect.result);

    if (Result.isSuccess(info) && info.success.type === "Directory") {
      return yield* resolveDirectorySource(absolute);
    }

    const scope = yield* resolveProjectScope(absolute, false);
    return [
      {
        rootDir: scope.rootDir,
        workspaceRoot: scope.workspaceRoot,
        tsconfig: scope.tsconfig,
        fileFilters: targetPathToFilters(scope.rootDir, scope.absolute, false),
      },
    ];
  });

const resolveTargetScopes = (target: TargetInput) =>
  Effect.gen(function* () {
    const resolved = [] as Array<{
      readonly rootDir: string;
      readonly workspaceRoot: string;
      readonly tsconfig?: string | undefined;
      readonly fileFilters: ReadonlyArray<string>;
    }>;
    for (const sourcePath of target.paths) {
      resolved.push(...(yield* resolveSource(sourcePath)));
    }

    if (resolved.length === 0) {
      return [
        { ...target, workspaceRoot: ".", rootDir: ".", tsconfig: undefined, fileFilters: [] },
      ] satisfies ReadonlyArray<ResolvedTargetInput>;
    }

    const grouped = new Map<
      string,
      {
        readonly workspaceRoot: string;
        readonly rootDir: string;
        readonly tsconfig?: string | undefined;
        readonly fileFilters: Array<string>;
        allFiles: boolean;
      }
    >();
    for (const scope of resolved) {
      const key = `${scope.workspaceRoot}\u0000${scope.rootDir}\u0000${scope.tsconfig ?? ""}`;
      const current = grouped.get(key) ?? {
        workspaceRoot: scope.workspaceRoot,
        rootDir: scope.rootDir,
        tsconfig: scope.tsconfig,
        fileFilters: [],
        allFiles: false,
      };
      if (scope.fileFilters.length === 0) {
        current.allFiles = true;
        current.fileFilters.length = 0;
      } else if (!current.allFiles) {
        current.fileFilters.push(...scope.fileFilters);
      }
      grouped.set(key, current);
    }

    return [...grouped.values()].map((scope) => ({
      ...target,
      workspaceRoot: scope.workspaceRoot,
      rootDir: scope.rootDir,
      tsconfig: scope.tsconfig,
      fileFilters: scope.allFiles ? [] : [...new Set(scope.fileFilters)],
    })) satisfies ReadonlyArray<ResolvedTargetInput>;
  });

const isBroadWorkspaceSource = (target: ResolvedTargetInput): boolean =>
  target.paths.some((sourcePath) => NodePath.resolve(sourcePath) === target.workspaceRoot) &&
  target.fileFilters.length === 0;

const pathMatchesFilter = (filePath: string, filter: string): boolean => {
  const normalizedFilePath = filePath.replaceAll("\\", "/");
  const normalizedFilter = filter.replaceAll("\\", "/");
  if (normalizedFilePath.includes(normalizedFilter)) return true;
  if (picomatch.isMatch(normalizedFilePath, normalizedFilter, { dot: true })) return true;
  if (!normalizedFilter.includes("/")) {
    return picomatch.isMatch(normalizedFilePath, `**/${normalizedFilter}`, { dot: true });
  }
  return false;
};

const pathMatchesAnyFilter = (filePath: string, filters: ReadonlyArray<string>): boolean =>
  filters.length === 0 || filters.some((filter) => pathMatchesFilter(filePath, filter));

const relativeSourcePaths = (target: ResolvedTargetInput, sourceFileName: string) => {
  const workspaceRelative = NodePath.relative(
    target.workspaceRoot,
    NodePath.join(target.rootDir, sourceFileName),
  ).replaceAll("\\", "/");
  return [sourceFileName.replaceAll("\\", "/"), workspaceRelative] as const;
};

const targetMayMatchCliFilters = (
  target: ResolvedTargetInput,
  cliFilters: ReadonlyArray<string>,
): boolean => {
  if (cliFilters.length === 0) return true;
  const projectPrefix = NodePath.relative(target.workspaceRoot, target.rootDir).replaceAll(
    "\\",
    "/",
  );
  if (projectPrefix.length === 0) return true;
  return cliFilters.some((filter) => {
    const normalizedFilter = filter.replaceAll("\\", "/");
    if (!normalizedFilter.includes("/")) return true;
    return (
      normalizedFilter.includes(projectPrefix) ||
      pathMatchesFilter(projectPrefix, normalizedFilter) ||
      picomatch.isMatch(`${projectPrefix}/__showme__.ts`, normalizedFilter, { dot: true })
    );
  });
};

const filterDts = (
  dts: DtsGenerationResult,
  target: ResolvedTargetInput,
  cliFilters: ReadonlyArray<string>,
): DtsGenerationResult => {
  return {
    ...dts,
    results: dts.results.filter((item) => {
      const sourceFileName = item.fileName.replace(/\.d\.ts$/u, ".ts");
      const paths = relativeSourcePaths(target, sourceFileName);
      return (
        paths.some((filePath) => pathMatchesAnyFilter(filePath, target.fileFilters)) &&
        paths.some((filePath) => pathMatchesAnyFilter(filePath, cliFilters))
      );
    }),
  };
};

const writeOutput = (output: string, outputPath: string | undefined) =>
  Effect.gen(function* () {
    if (outputPath == null) {
      yield* Console.log(output);
      return;
    }

    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    yield* fs.writeFileString(path.resolve(outputPath), output);
  });

const runShowme = (options: CliOptions) =>
  Effect.gen(function* () {
    const targets = yield* resolveTargetScopes(options.input);
    const broadTargets = targets.filter(isBroadWorkspaceSource);
    if (options.fileFilters.length === 0 && broadTargets.length > broadWorkspaceThreshold) {
      yield* Console.error(
        `warning: workspace root source resolved ${broadTargets.length} project scopes; pass --filter or an app/package folder to limit generation`,
      );
    }
    const generator = yield* DtsGenerator;
    const outputs: Array<string> = [];

    for (const target of targets) {
      if (!targetMayMatchCliFilters(target, options.fileFilters)) continue;

      const dts = yield* generator.generate({
        workspaceRoot: target.workspaceRoot,
        rootDir: target.rootDir,
        tsconfig: target.tsconfig,
      });
      yield* Console.error(
        `${dts.results.length} declaration files, ${dts.elapsedMillis.toFixed(0)}ms, ${target.rootDir}${target.tsconfig == null ? "" : `, ${target.tsconfig}`}`,
      );

      const filteredDts = filterDts(dts, target, options.fileFilters);
      if (dts.results.length === 0) {
        yield* Console.error(
          `warning: no declaration files generated for ${target.rootDir}${target.tsconfig == null ? "" : ` using ${target.tsconfig}`}`,
        );
      } else if (filteredDts.results.length === 0) {
        yield* Console.error(`warning: no generated files matched filters for ${target.rootDir}`);
      }

      if (options.kind.length === 1 && options.kind[0] === "declarations") {
        outputs.push(formatDtsResults(filteredDts));
        continue;
      }

      const extractor = yield* DtsExtractor;
      const formatter = yield* Formatter;
      const result = yield* extractor.extract({
        target: { ...target, fileFilters: [] },
        dts: filteredDts,
        kind: options.kind,
      });
      outputs.push(yield* formatter.format(result, options));
    }

    yield* writeOutput(outputs.filter((output) => output.length > 0).join("\n"), options.output);
  });

const commandConfig = {
  sources: Args.path("sources", { pathType: "either", mustExist: false }).pipe(
    Args.variadic({ min: 0 }),
    Args.withDescription("Source project folders and/or files. Defaults to current directory."),
  ),
  kind: Flag.choice("kind", kindChoices).pipe(
    Flag.atMost(100),
    Flag.withDefault([] as Array<(typeof kindChoices)[number]>),
    Flag.withDescription(
      "Structure kind(s), repeatable: all, declarations, signatures, interfaces, types, variables, imports, exports",
    ),
  ),
  filter: Flag.string("filter").pipe(
    Flag.atMost(100),
    Flag.map(parseList),
    Flag.withDefault([] as Array<string>),
    Flag.withDescription(
      "File path filter glob(s), repeatable or comma-separated; matches generated source paths",
    ),
  ),
  output: Flag.file("output", { mustExist: false }).pipe(
    Flag.optional,
    Flag.withDescription("Write output to file"),
  ),
  line: Flag.boolean("line").pipe(Flag.withDescription("Emit source line comments before entries")),
  format: Flag.choice("format", ["plain", "markdown"] as const).pipe(
    Flag.withDefault("plain"),
    Flag.withDescription("Output format"),
  ),
} as const;

export const appLayer = Layer.mergeAll(
  NodeServices.layer,
  DtsGenerator.layer,
  DtsExtractor.layer,
  Formatter.layer,
);

export const cli = Command.make("showme", commandConfig, (config) => {
  const options: CliOptions = {
    input: sourcesToTargetInput(config.sources),
    kind: parseKind(config.kind),
    fileFilters: config.filter,
    output: Option.isSome(config.output) ? config.output.value : undefined,
    lineNumber: config.line,
    format: config.format,
  };
  return runShowme(options);
}).pipe(
  Command.withDescription(
    "Generate compiler-backed DTS declarations with tsgo and filter them into compact code context.",
  ),
  Command.withExamples([
    {
      command: "showme src --kind signatures",
      description: "Show compact function and class signatures for a source folder",
    },
    {
      command: 'showme . --filter "src/**/*.ts" --filter "!**/*.test.ts"',
      description: "Limit output to matching source files",
    },
    {
      command: "showme src/services --kind signatures | bat -l ts",
      description: "View service signatures with TypeScript syntax highlighting",
    },
  ]),
  Command.provide(appLayer),
);

export const main = Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide(NodeServices.layer),
);
[];
