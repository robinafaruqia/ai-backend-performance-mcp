# Development

## Prerequisites

- Node.js 18+
- npm

## Setup

```bash
npm install
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint |
| `npm run format` | Prettier write |
| `npm test` | Vitest unit and integration tests |
| `npm run build` | Compile to `dist/` |

## Running the MCP server locally

`npm install` runs `prepare`, which compiles `dist/`. You can also build explicitly:

```bash
npm run build
node dist/index.js
```

The server communicates over **stdio** (do not write analysis logs to stdout). Point Cursor at the compiled entry:

```json
{
  "mcpServers": {
    "backend-performance": {
      "command": "node",
      "args": ["/absolute/path/to/ai-backend-performance-mcp/dist/index.js"]
    }
  }
}
```

Confirm `dist/index.js` starts with `#!/usr/bin/env node` after a build.

## Publishing to npm

Quality checks stay in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml). A `v*` tag push runs [`.github/workflows/publish.yml`](../.github/workflows/publish.yml), which calls `npm publish` (`prepublishOnly` rebuilds and tests). Set repository secret `NPM_TOKEN` to an npm automation token before tagging `v0.1.0`.

## Project layout

```
src/
  server/       MCP transport and tool registration
  tools/        Thin MCP tool wrappers
  analyzers/    Static analysis implementations
  investigation/ Enriched evidence, related findings, investigate_performance
  parsers/      package.json and source file loading
  models/       Finding and result helpers
  utils/        Filesystem safety and logging
tests/
  fixtures/     Paired mini-projects: anti-patterns and valid code that must stay quiet
  analyzers/    Analyzer unit tests
  tools/        Tool-level tests
```

Each analyzer should have both a **problematic** fixture and a **valid** fixture so rules do not fire on every await, query, loop, or connection.

## Adding an analyzer

1. Create an analyzer under `src/analyzers/<category>/`
2. Implement the `Analyzer` interface
3. Register in `src/analysisEngine.ts`
4. Add **bad and good** fixture projects plus unit tests under `tests/`
5. Document the rule’s confidence band in [confidence.md](./confidence.md)

## Safety constraints

- Read-only filesystem access within the validated `projectPath`
- Skip symlinks; cap file size and file count
- No code execution from analyzed repositories
- No package installation or git modifications

Confidence rules: [confidence.md](./confidence.md).
