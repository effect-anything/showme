# @effect-x/showme

A TypeScript preflight and architecture-alignment tool that shows interfaces, types, signatures, exports, and wiring instead of full source code.

`showme` is a smarter way to work in TypeScript projects. Instead of dumping implementation files, it extracts the interface layer — types, signatures, imports, exports, services, and module boundaries — so you can plan, edit, refactor, and review against the API surface before diving into how the code works.

Use it before major planning, multi-file edits, refactors, architecture explanations, or large source reads. Re-run it after substantial changes to verify that signatures, exports, and boundaries still match the intended design.

Typical flow:

```bash
showme src --kind signatures
```

Then use the API surface to decide which files actually need deeper reading.

Default posture: narrow by source path first, then by `--kind`, then by `--filter` only if needed.

## When to use

- Preflighting a TypeScript task before planning, editing, or refactoring.
- Understanding project architecture, service boundaries, dependencies, layers, and exports.
- Reviewing services, schemas, signatures, types, or public API shape before reading implementation.
- Re-checking architecture after substantial changes so later edits stay aligned.
- Preparing compact context before editing, explaining, or handing code to an agent.
- Summarizing a package API without getting lost in implementation details.

## What it shows

- `declarations` — raw compiler-generated `.d.ts` output.
- `signatures` — class and function signatures.
- `interfaces` — interface declarations.
- `types` — type aliases.
- `variables` — exported variables and constants.
- `imports` / `exports` — module boundaries.

The default `all` mode combines the structured kinds above.

## Install

```bash
npm install -g @effect-x/showme
```

Or run without installing:

```bash
npx @effect-x/showme --help
```

### Installing as an agent skill

If you use opencode or another agent framework with local skills, copy the
skill from this repo into your agent skill directory. Treat the copy under this
repo as the source of truth, then sync it into your local agent skills after
each change.

For example:

```bash
mkdir -p ~/.agents/skills/architecture-preflight
cp skills/architecture-preflight/SKILL.md ~/.agents/skills/architecture-preflight/SKILL.md
```

To improve invocation frequency, also add a short hint to your project's
`AGENTS.md` telling the agent to use `architecture-preflight` before major
TypeScript planning, multi-file edits, refactors, architecture explanations, or
large source reads, and to rerun it after substantial changes.

This matters because many agent systems initially see only a skill's `name` and
`description`. A matching hint in `AGENTS.md` significantly increases the chance
that the skill is loaded early and reused throughout the task.

> ## TypeScript Preflight Rule
>
> - Before any TypeScript planning, multi-file edit, refactor, or architecture question, load the `architecture-preflight` skill first. Re-run it after substantial changes to verify alignment.
> - Trigger on: definitions, types, signatures, exports, services, layers, schemas, wiring, module boundaries, or broad source reading.
> - Posture: inspect declarations/signatures first, then narrow to implementation files only as needed.

## Usage

```bash
showme [flags] <sources...>
```

If no source is provided, `showme` scans the current directory.

### Examples

Show compact signatures for the current project:

```bash
showme
```

Show declarations for a package folder:

```bash
showme packages/core --kind declarations
```

Only include specific files:

```bash
showme . --filter "src/**/*.ts" --filter "!**/*.test.ts"
```

Select multiple structure kinds:

```bash
showme src --kind signatures --kind interfaces --kind types
```

Write Markdown output for sharing:

```bash
showme src --format markdown --output showme.md
```

Emit source line comments before entries:

```bash
showme src --line
```

## Flags

| Flag                | Description                                                                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `--kind <kind>`     | Structure kind(s), repeatable. Supported values: `all`, `declarations`, `signatures`, `interfaces`, `types`, `variables`, `imports`, `exports`. |
| `--filter <glob>`   | File path filter glob(s), repeatable.                                                                                                           |
| `--output <file>`   | Write output to a file instead of stdout.                                                                                                       |
| `--line`            | Emit source line comments before entries when source maps are available.                                                                        |
| `--format <format>` | Output format: `plain` or `markdown`.                                                                                                           |
| `--help`            | Show help information.                                                                                                                          |
| `--version`         | Show package version.                                                                                                                           |

## How it works

1. Resolve source paths to project scopes and `tsconfig` files.
2. Run `tsgo` with declaration-only output into `node_modules/.cache/showme-dts`.
3. Read generated `.d.ts` files and declaration maps.
4. Filter by target paths and `--filter` globs.
5. Format the requested structure kinds.

You can override the TypeScript Go binary with the `TSGO` environment variable, for example:

`TSGO=/path/to/tsgo showme src`

## Requirements

- Node.js `>=24`
- A TypeScript project with a usable `tsconfig` is recommended.

## Development

This repository uses Bun for local development.

```bash
bun install
bun run check
bun run build
bun run pack:check
```

Useful scripts:

- `bun run dev` - build in watch mode.
- `bun run test` - run tests.
- `bun run typecheck` - run `tsgo --noEmit`.
- `bun run format` - format files with `oxfmt`.
- `bun run pack:check` - inspect the npm tarball with `npm pack --dry-run`.

## Release

The package is published to npm as `@effect-x/showme` with public access and npm provenance enabled.

```bash
bun run changeset
bun run version-packages
bun run release
```

The GitHub Actions release workflow runs the full check pipeline and uses Changesets to create release pull requests or publish from `main`.

## License

MIT
