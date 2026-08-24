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

Detects (as **potential** unless noted):

- Mongo/Postgres queries inside loops that look like per-item lookups (N+1)
- Mongo `find()` without in-source `limit`/`skip`
- SQL `SELECT` without `LIMIT`/`FETCH`

Does **not** flag `Array.prototype.find`, batched `$in` / `ANY()` / `IN (...)`, `_id`-only finds, or INSERT/UPDATE.

## analyze_indexes

MongoDB-focused comparison of in-repo `createIndex` / `ensureIndex` keys vs query filter/sort fields.

Does **not** inspect Atlas or the live cluster. If the repository contains no `createIndex` calls, this tool emits no index findings (indexes may be managed elsewhere). `_id` lookups are ignored.

## analyze_async_patterns

Detects:

- `await` inside `for` / `for..of` / `forEach` / `map` (not `while` pagination/retry loops)
- Sequential awaits in one block that do **not** consume prior bindings
- `readFileSync` / `execSync` (and similar) inside request handlers or loops

Does **not** flag `Promise.all`, `JSON.parse`, or module-scope startup `readFileSync`. Does not recommend `Promise.all` when the next await uses the previous result.

## analyze_connection_pooling

Detects construction of `MongoClient`, `pg.Pool`, `createPool`, or `mongoose.connect` inside HTTP route handlers or loops.

Does **not** flag module-scope clients, `main`/`start`/`bootstrap` setup, or `existingClient.connect()`.

## analyze_dependencies

Analyzes `package.json` via static import/require scans:

- Potentially unused production dependencies
- Dev dependencies imported in application source
- Test tools listed under `dependencies`
- Imports not declared in `package.json`

Does **not** emit informational dependency-count findings. Yarn/pnpm lockfiles and CLI-only packages are not fully modeled.

## Finding schema

Each finding includes:

- `ruleId`, `category`, `severity`, `title`, `description`
- `file`, `line`, `column` (when available)
- `evidence.kind` — `confirmed` or `potential`
- `evidence.snippet` — relevant code excerpt
- `confidence` (0–1) and `confidenceRationale`
- `recommendation`, `estimatedImpact`

See [confidence.md](./confidence.md) for scoring bands.
