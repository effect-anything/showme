# @effect-x/showme

A TypeScript-aware read tool that shows interfaces, types, and signatures instead of full source code.

`showme` is a smarter way to read TypeScript projects. Instead of dumping implementation files, it extracts the interface layer — types, signatures, imports, and exports — so you can understand what code does before diving into how it does it.

Use it before reading source files, reviewing a codebase, or preparing compact context for an AI coding agent.

Typical flow:

```bash
showme src --kind signatures
```

Then use the API surface to decide which files actually need deeper reading.

## When to use

- Exploring an unfamiliar TypeScript repo before reading full source files.
- Understanding project architecture, service boundaries, and dependencies.
- Reviewing services, layers, schemas, types, or function signatures.
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

| Flag                | Description                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--kind <kind>`     | Structure kind(s), repeatable or comma-separated. Supported values: `all`, `declarations`, `signatures`, `interfaces`, `types`, `variables`, `imports`, `exports`. |
| `--filter <glob>`   | File path filter glob(s), repeatable or comma-separated.                                                                                                           |
| `--output <file>`   | Write output to a file instead of stdout.                                                                                                                          |
| `--line`            | Emit source line comments before entries when source maps are available.                                                                                           |
| `--format <format>` | Output format: `plain` or `markdown`.                                                                                                                              |
| `--help`            | Show help information.                                                                                                                                             |
| `--version`         | Show package version.                                                                                                                                              |

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
