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

```bash
npm run build
node dist/index.js
```

The server communicates over stdio. Configure your MCP client to launch the binary.

## Project layout

```
src/
  server/       MCP transport and tool registration
  tools/        Thin MCP tool wrappers
  analyzers/    Static analysis implementations
  parsers/      package.json and source file loading
  models/       Finding and result helpers
  utils/        Filesystem safety and logging
tests/
  fixtures/     Minimal projects with known anti-patterns
  analyzers/    Analyzer unit tests
  tools/        Tool-level tests
```

## Adding an analyzer

1. Create an analyzer under `src/analyzers/<category>/`
2. Implement the `Analyzer` interface
3. Register in `src/analysisEngine.ts`
4. Add fixture project and unit tests under `tests/`

## Safety constraints

- Read-only filesystem access within the validated `projectPath`
- No code execution from analyzed repositories
- No package installation or git modifications
