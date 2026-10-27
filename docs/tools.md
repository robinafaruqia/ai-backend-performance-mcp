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

MongoDB-focused comparison of in-repo `createIndex` / `ensureIndex` / `createIndexes` keys vs query filter and sort fields.

Coverage is a compound-index prefix check: equality fields (any order) must be a prefix, at most one range predicate may be the next key, and sort direction must match that key order or a full reverse scan. A bag of field names is not treated as coverage.

Findings stay **potential**. They are not a statement that the database is missing an index. If the repository contains no `createIndex` calls, or any spec is dynamic (variable, spread, or computed key), this tool emits no index findings. `_id` lookups are ignored.

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

When `package-lock.json` is present, reports a package resolved to more than one version. That finding stays **potential**: nested copies are sometimes required.

Does **not** emit informational dependency-count findings. Yarn/pnpm lockfiles and CLI-only packages are not fully modeled.

## investigate_performance

Runs every analyzer once, then returns an **investigation** payload for an AI client to reason over. Deterministic: no LLM inside the server.

**Input:** `{ projectPath }` (same as the other tools).

**Output**

- `projectContext` — package metadata, `technologies`, `databases`, `frameworks`
- `findings` — enriched findings (location, technology, `costWhy`, `relatedFindingIds`, `inspectNext`)
- `clusters` — groups by same file, same HTTP route, or complementary rules
- `hotspots` — ranked by severity × confidence × related count
- `inspectNext` — ordered list of finding / file / cluster targets
- `summary` — includes `clusterCount`

Use this as the default entry point when an agent should decide what to inspect next. The focused `analyze_*` tools remain for one category.

Every tool accepts optional `minSeverity`: `info`, `low`, `medium`, `high`, or `critical`. Findings below that rank are omitted.

## explain_performance

Runs the full scan, retrieves the closest rule cards and findings for `question`, and answers from those passages only.

**Input:** `projectPath`, optional `question`, optional `minSeverity`.

**Output:** `mode` (`llm` or `retrieved-only`), `answer`, `retrieval` (id, score, excerpt), `findings`, `summary`.

No model is called unless `PERFORMANCE_MCP_LLM_BASE_URL` and `PERFORMANCE_MCP_LLM_API_KEY` are set. Passages are marked untrusted so instructions inside repository text are not treated as system instructions.

## export_report

**Input:** `projectPath`, optional `format` (`json` or `sarif`), optional `minSeverity`.

`json` is the `analyze_project` payload. `sarif` is SARIF 2.1.0. The server does not write the report to disk.

## analyze_redis patterns

Covered by the full scan (there is no separate Redis tool):

- `KEYS`
- `SET` / `HSET` without `EX`, `PX`, `EXAT`, `PXAT`, or `KEEPTTL`
- `createClient` or `new Redis` inside a route handler
- `get` / `set` and similar commands inside a loop

A module-scope client and `SET` with `EX` are not findings.

## analyze_orm patterns

Covered by the full scan:

- Prisma `findMany` / `findUnique` inside a loop
- Prisma `findMany` without `take` or `cursor`
- TypeORM `find` / `findOne` / `getMany` inside a loop
- TypeORM list queries without `take`, `skip`, or `limit`

## Finding schema

Each finding includes:

- `ruleId`, `category`, `severity`, `title`, `description`
- `file`, `line`, `column` (when available)
- `evidence.kind` — `confirmed` or `potential`
- `evidence.snippet` — relevant code excerpt
- `confidence` (0–1) and `confidenceRationale`
- `recommendation`, `estimatedImpact`
- `location` — file, line, enclosing function, HTTP route, `hotPath`
- `technology` — databases, frameworks, rule family
- `costWhy` — catalog text for why the pattern is likely expensive
- `relatedFindingIds` — other findings in the same file/route or complementary rules
- `inspectNext` — catalog next steps (not an LLM)

See [confidence.md](./confidence.md) for scoring bands. `costWhy` / `inspectNext` do not change confidence.
