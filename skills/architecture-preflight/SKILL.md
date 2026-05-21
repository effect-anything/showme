---
name: architecture-preflight
description: TypeScript architecture preflight. Shows signatures, types, exports, services, and layer wiring. Use before planning, multi-file edits, or refactors; rerun after changes.
---

A TypeScript preflight and architecture-alignment tool. Instead of showing full source code, it extracts the interface layer — types, signatures, exports, services, and wiring — so you can plan, edit, and review against the API surface before diving into implementation.

## Workflow

Start from declarations/signatures, not implementation. Use repeatedly throughout a task — not just at the start — whenever you need to check or re-check service boundaries, exports, signatures, layer wiring, or architectural intent.

Typical flow: `showme src --kind signatures` → understand boundaries → make changes → `showme` again to verify alignment.

When in doubt, prefer this over raw `read` for TypeScript work. Read implementation only after narrowing the target via declarations.

Default posture: start from the smallest stable project scope (`src`, `src/services`, `packages/foo/src`, `apps/web/src`), then choose declaration kinds, then narrow with `--filter`. Pass individual files directly only when the target set is already very clear.

## Use when

- You need a compact view of definitions, signatures, exports, services, layers, schemas, or wiring
- You want to plan or explain a TypeScript change without reading full implementation first
- You want to re-check architecture mid-task instead of relying on stale assumptions
- You already changed TypeScript code substantially and need to confirm alignment before continuing

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

## Command patterns

Guidelines for effective commands:

- Start with a stable scope: `src`, `src/services`, `src/domain`, `packages/foo/src`, or `apps/web/src`.
- Choose the smallest useful `--kind` set, usually `signatures`, `types`, and/or `exports`.
- Use `--filter` to narrow within that scope. Prefer stable path fragments (`SessionStore`, `services/`, `domain/`) over fragile wildcard guesses.
- If the codebase mixes casing (`Agent` and `agent`), search both forms or use a broader scope.
- Pass individual files directly only after other steps have made the target set obvious.
- For text search inside declaration output, pipe to `rg`.

```sh
# General preflight — signatures + types is the most useful combo
showme src --kind signatures --kind types

# Narrow to a subsystem
showme src --kind signatures --kind types --filter 'services/**' --filter 'commands/**'

# Preflight before planning a feature in a specific area
showme src --kind signatures --filter 'services/**'

# Re-check exports and signatures after a refactor
showme src --kind signatures --kind exports --filter SessionStore

# Layer / service wiring questions
showme src --kind signatures --kind types --filter runtimeLayer --filter 'services/**'

# Types in a specific domain
showme src --kind types --filter domain

# Full declarations for one file with line numbers
showme src/services/SessionStore.ts --kind declarations --line

# Package-scoped inspection in a monorepo
showme packages/auth/src --kind signatures --kind types --filter service
```

## Notes

- Progress info goes to stderr; stdout is clean TypeScript-like output.
- Quote glob filters: `--filter 'src/**/*.ts'`.
- For monorepos, pass specific app/package folders rather than the workspace root.
- Prefer app/package-local paths over the whole monorepo when using this as a repeated check.

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
