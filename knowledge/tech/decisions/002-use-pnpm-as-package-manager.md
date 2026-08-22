---
type: decision
status: accepted
date: 2026-08-22
---

# ADR-002: Use pnpm as Package Manager

## Context

chatSaaS is a TypeScript monorepo with multiple packages (frontend, backend functions, shared libraries, infrastructure). We need a package manager that handles workspaces efficiently, is fast, and has good disk usage.

## Decision

Use **pnpm** as the package manager for all dependency installation, script execution, and workspace management.

## Rationale

**Disk efficiency:**
- pnpm uses a content-addressable store, saving significant disk space in monorepos
- Shared dependencies are hard-linked, not duplicated

**Performance:**
- Faster installs than npm/yarn
- Strict dependency resolution prevents phantom dependencies

**Monorepo support:**
- Built-in workspace support without additional tools
- Fast filtering and execution across workspaces

**Developer experience:**
- Compatible with npm scripts
- Standard lock file format
- Growing ecosystem adoption

## Consequences

**Positive:**
- Faster CI/CD builds
- Reduced disk usage in monorepo
- Better dependency isolation
- Clear workspace boundaries

**Negative:**
- Team must install pnpm globally or use corepack
- Slightly different commands than npm (though very similar)

## Implementation

All commands use pnpm:

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Run tests
pnpm test

# Build
pnpm build

# Add dependency
pnpm add <package>

# Workspace-specific command
pnpm --filter web dev
```

Enable Corepack for version management:
```bash
corepack enable
```

## Alternatives Considered

**npm:** Standard, but slower and uses more disk space in monorepos.

**Yarn:** Good monorepo support, but pnpm is faster and uses less disk.

**Bun:** Very fast but still maturing; not stable enough for production infrastructure.
