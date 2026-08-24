# Architecture

## Overview

`ai-backend-performance-mcp` follows a strict layered architecture where the MCP server exposes tools, tools delegate to the analysis engine, and analyzers produce structured findings.

```mermaid
flowchart TD
  Client[MCP Client / AI Agent]
  Server[MCP Server]
  Tools[MCP Tools]
  Engine[Analysis Engine]
  Analyzers[Individual Analyzers]
  Findings[Structured Findings]

  Client --> Server
  Server --> Tools
  Tools --> Engine
  Engine --> Analyzers
  Analyzers --> Findings
  Findings --> Tools
  Tools --> Server
  Server --> Client
```

## Layers

### MCP Server (`src/server/`)

- Registers six analysis tools
- Handles stdio transport
- Contains no analysis logic

### MCP Tools (`src/tools/`)

- Validate input (`projectPath`)
- Load `ProjectContext` via the analysis engine
- Invoke specific analyzers
- Format JSON responses for MCP clients

### Analysis Engine (`src/analysisEngine.ts`)

- Loads project context (package.json, source files, detected technologies)
- Orchestrates analyzer execution
- Caches TypeScript ASTs per `sourceFiles` array so analyzers do not re-parse

### Analyzers (`src/analyzers/`)

| Analyzer | Focus |
|----------|-------|
| `databaseQueryAnalyzer` | Mongo/Postgres N+1 and unbounded reads. Ignores `Array.find` and batched `$in` / `ANY()` / `IN`. |
| `indexAnalyzer` | Compares queries to in-repo `createIndex` only. Never claims the live database is missing an index. No findings if the repo has no `createIndex`. |
| `asyncPatternAnalyzer` | Await in loops, sequential **independent** awaits, blocking sync I/O on request paths. Does not flag `Promise.all`. |
| `connectionPoolAnalyzer` | `MongoClient` / `Pool` construction in handlers or loops, not module-scope startup. |
| `dependencyAnalyzer` | Unused/misplaced deps from static imports. No informational count findings. |

Shared call classification lives in `src/analyzers/ast/astUtils.ts`. Confidence bands: [confidence.md](./confidence.md).

### Parsers & Utilities

- `parsers/packageJson.ts` — dependency and technology detection
- `parsers/sourceFiles.ts` — safe, read-only source file collection
- `utils/fileSystem.ts` — path containment, symlink skip, size/count caps
- `analyzers/ast/astUtils.ts` — TypeScript AST helpers
- `models/confidence.ts` — confidence constants and clamp

## Safety

All analysis is **read-only**. The engine never modifies source files, installs dependencies, or executes repository code.

## Extensibility

Add a new analyzer by:

1. Implementing the `Analyzer` interface
2. Registering it in `AnalysisEngine` default analyzers
3. Optionally exposing a dedicated MCP tool
