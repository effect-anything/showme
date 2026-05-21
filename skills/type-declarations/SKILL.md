---
name: type-declarations
description: A TypeScript-aware read tool that shows interfaces, types, and signatures instead of full source code. Use before reading files to understand architecture from the API surface without getting lost in implementation details.
---

A smarter way to read TypeScript projects. Instead of showing full source code, it extracts the interface layer — types, signatures, exports — so you understand what code does before diving into how.

## Workflow principle

Before reading source files or exploring a project in detail, run `showme` first to get the API surface. This avoids getting lost in implementation details. Use the output to decide which files actually need deeper reading.

Typical flow: `showme src --kind signatures` → understand architecture → read only the relevant files.

## Use when

- Exploring an unfamiliar TypeScript repo — use this instead of reading source files directly
- Understanding project architecture, service boundaries, and dependencies
- Reviewing services, layers, schemas, types, or function signatures
- Preparing compact context before editing or explaining code

## Usage

```sh
showme <sources...> [--kind <kind>] [--filter <glob>] [--line] [--format plain|markdown]
```

Sources are files and/or folders. Defaults to current directory.

## Kinds

`--kind` selects what to extract (repeatable):

- `all` (default) — everything below
- `declarations` — raw `.d.ts` output
- `signatures` — classes/functions
- `interfaces`, `types`, `variables`, `imports`, `exports`

## Filtering

`--filter` matches file paths (substring or glob, repeatable):

```sh
showme src --kind signatures --filter SessionStore
showme src --kind types --filter 'domain/*.ts'
```

For text search within output, pipe to `rg`.

## Examples

```sh
# Service signatures in a folder
showme src/services --kind signatures

# Types in a specific domain
showme src --kind types --filter domain

# Full declarations for one file with line numbers
showme src/services/SessionStore.ts --kind declarations --line

# Multiple sources
showme apps/server/api.ts packages/auth/src/service.ts --kind signatures
```

## Notes

- Progress info goes to stderr; stdout is clean TypeScript-like output.
- Quote glob filters: `--filter 'src/**/*.ts'`.
- For monorepos, pass specific app/package folders rather than the workspace root.

## Output example

```ts
// src/domain/Session.ts
export type SessionIdentifier = {
  readonly source: SessionSource;
  readonly nativeId: string;
  readonly key: string;
};
export type SessionInfo = Schema.Schema.Type<typeof SessionInfoSchema>;

// src/services/SessionStore.ts
import { Effect, Layer } from "effect";
import { type SessionInfo } from "../domain/Session.ts";
export declare class SessionStore extends SessionStore_base {
  static readonly layer: Layer.Layer<SessionStore, never, never>;
}

// src/services/SessionExtractor.ts
export declare class SessionExtractor extends SessionExtractor_base {
  static readonly layer: Layer.Layer<SessionExtractor, never, SessionStore>;
}
```

Each file is prefixed with a `// path` comment. With `--line`, entries also get `// L<n>` source line markers.
