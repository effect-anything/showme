## Project Introduction

`showme` is a Bun-based TypeScript CLI project for showing declarations, signatures, and type information.

# Information

- Run commands from the repo root.
- The package manager used is `bun`.
- Primary runtime targets are `bun` for scripts and `node >= 24` for the built CLI.
- Avoid `index.ts` barrel files;

## Structure

- `.references/`: reference repositories
- `src/`: main files
- `docs/`: project documentation

## Working Loop

1. Identify the target app or package.
2. Follow local patterns in that directory.
3. Run focused checks/tests for the target.

## TypeScript Preflight Rule

- Before any TypeScript planning, multi-file edit, refactor, or architecture question, load the `architecture-preflight` skill first. Re-run it after substantial changes to verify alignment.
- Trigger on: definitions, types, signatures, exports, services, layers, schemas, wiring, module boundaries, or broad source reading.
- Posture: inspect declarations/signatures first, then narrow to implementation files only as needed.

## Quick Commands

```bash
bun run check (typecheck, lint, formatter, test)
bun run build
```

# Specifications

To learn more about previous and current specifications for this project, see
the `.specs/README.md` file.

# Learning from reference repositories

- `.references/` contains reference repositories and supporting materials for this project. Treat it as the first place to look when you need examples, patterns, prior art, or library-specific guidance.
- When working with `effect` or `@effect/*`, prefer `.references/effect/README.md` first. It is the authoritative guide in this repo for Effect usage and best practices.
- More generally, do not limit reference lookup to Effect only: check other relevant projects under `.references/` whenever they better match the problem you are solving.
- Prefer learning from `.references/` over browsing generated build output or digging through `node_modules/`, unless you specifically need implementation-level confirmation.

## Engineering Principles

- **Proactive Progress**: Don't wait for instructions. Identify blockers, propose solutions, and push work forward autonomously.
- **Robust & Scalable**: Prefer solutions that work reliably and can grow. Avoid fragile hacks that break under load.
- **Globally Optimal**: Consider the whole system, not just the immediate fix. Trade-offs should be conscious and documented.
- **Verify Reality**: Test assumptions. A working demo beats a perfect plan.
- **Ship & Iterate**: Perfect is the enemy of done. Get to working state, then improve.
