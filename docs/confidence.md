# Confidence scoring

Static analysis cannot see runtime database state, traffic, or values inside variables. Confidence is a **cap**, not a guarantee of correctness.

## Bands

| Band | Range | Constant | When to use |
|------|-------|----------|-------------|
| confirmed-syntactic | 0.85–0.95 | `Confidence.confirmedSyntactic` (0.90), `Confidence.confirmedStrong` (0.85) | The AST shows the anti-pattern directly, e.g. `new MongoClient()` inside `app.get`. |
| potential-strong | 0.65–0.80 | `Confidence.potentialStrong` (0.72) | Strong structure, but a benign reading remains possible (N+1 with the loop binding in the filter). |
| potential-moderate | 0.50–0.64 | `Confidence.potentialModerate` (0.55) | Heuristic with incomplete project knowledge (in-repo `createIndex` vs Atlas). |
| potential-weak | 0.35–0.49 | `Confidence.potentialWeak` (0.42) | Weak syntactic hint (unbounded SELECT text). Prefer omitting the finding if unsure. |

## Rules

1. Never assign `1.0` except for purely factual, non-issue inventory (this project does not emit those).
2. `evidence.kind` is `confirmed` only when the syntactic facts are unambiguous. Confidence can still be below 1 because **impact** is estimated.
3. Prefer omitting a finding over emitting one below **0.35**.
4. Do not raise confidence because a pattern is “common”. Raise it only with evidence in the AST or `package.json`.
5. Findings that depend on cluster state (indexes, collection size) must stay `potential` and say so in `confidenceRationale`.

## Mapping to rules

| Rule ID | Typical band | Why |
|---------|--------------|-----|
| `db.mongo.n-plus-one` / `db.pg.n-plus-one` | potential-strong if the loop binding is in the query; else potential-moderate | Per-item queries are a smell, not proof of N+1 at runtime. |
| `db.mongo.unbounded-find` | potential-moderate | Helpers wrapping `find()` are not followed. |
| `db.pg.unbounded-select` | potential-weak | SQL strings may be views, builders, or already bounded elsewhere. |
| `db.mongo.index-not-in-source` | potential-moderate | Compared only to `createIndex` in source. No finding if the repo has zero `createIndex` calls. |
| `async.await-in-loop` | confirmed-strong | Await is in an iteration body. `Promise.all` is a suggestion only when items look independent. |
| `async.sequential-independent-awaits` | potential-strong | No in-block identifier dependence. Side effects are not modeled. |
| `async.blocking-sync-in-handler` | confirmed-syntactic | `*Sync` APIs in a route handler or loop. Module-scope startup reads are ignored. |
| `pooling.client-in-handler` / `pooling.client-in-loop` | confirmed-syntactic / confirmed-strong | Construction of `MongoClient` / `Pool` / `createPool`, not `client.connect()` on an existing instance. |
| `deps.*` | potential-weak to confirmed-strong | Import scan cannot see CLI binaries or dynamic `require`. |

Implementation: `src/models/confidence.ts`. Each finding should set `confidenceRationale`.
