# MCP Tools

## analyze_project

Full-project scan across all registered analyzers.

**Input**

| Field | Type | Description |
|-------|------|-------------|
| `projectPath` | string | Path to the Node.js project |

**Output**

- `technologies` — detected stack (mongodb, postgresql, express, etc.)
- `metadata` — package name/version, source file count
- `findings` — flat list of findings
- `groupedFindings` — by category, severity, and file
- `summary` — counts and evidence breakdown

## analyze_database_queries

Detects:

- Queries inside loops (potential N+1)
- Potentially unbounded `find` / `query` calls

## analyze_indexes

MongoDB-focused static comparison of:

- `createIndex` / `ensureIndex` definitions
- Query filter and sort fields in `find` calls

## analyze_async_patterns

Detects:

- `await` inside `for`/`for..of` loops
- Sequential independent awaits in the same block
- Blocking sync operations (`readFileSync`, `execSync`, etc.)
- `Promise.all` usage (informational)

## analyze_connection_pooling

Detects:

- `MongoClient.connect`, `new Pool`, or similar inside request handlers
- Connection creation inside loops

## analyze_dependencies

Analyzes `package.json` and `package-lock.json`:

- Dependency counts
- Potentially unused production dependencies
- Dev dependencies imported in source
- Test tools listed under `dependencies`

## Finding schema

Each finding includes:

- `category`, `severity`, `title`, `description`
- `file`, `line`, `column` (when available)
- `evidence.kind` — `confirmed` or `potential`
- `evidence.snippet` — relevant code excerpt
- `confidence` (0–1)
- `recommendation`, `estimatedImpact`
