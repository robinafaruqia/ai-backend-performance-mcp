export interface RuleGuidance {
  costWhy: string;
  inspectNext: string[];
}

const DEFAULT_GUIDANCE: RuleGuidance = {
  costWhy: 'This pattern can add latency or resource use under load, depending on traffic and data size.',
  inspectNext: ['Open the cited file and confirm the call is on a request or loop path.'],
};

const BY_RULE: Record<string, RuleGuidance> = {
  'pooling.client-in-handler': {
    costWhy:
      'Opening a MongoClient or pool per HTTP request repeats TCP/TLS handshake and auth instead of reusing connections.',
    inspectNext: [
      'Check whether a module-scope client or pool already exists in this file or a db helper.',
      'Confirm the handler does not also run queries in a loop (connection churn plus N+1).',
    ],
  },
  'pooling.client-in-loop': {
    costWhy: 'Constructing a client inside a loop multiplies handshake cost by iteration count.',
    inspectNext: [
      'Move client construction outside the loop and reuse one instance.',
      'Look for N+1 queries in the same loop body.',
    ],
  },
  'db.mongo.n-plus-one': {
    costWhy: 'A query per loop item produces round-trips that grow with collection or page size.',
    inspectNext: [
      'See whether the loop variable is in the filter (true per-item lookup).',
      'Prefer $in / aggregation or a join-style prefetch.',
      'Check index coverage for the filter fields.',
    ],
  },
  'db.pg.n-plus-one': {
    costWhy: 'Per-iteration SQL round-trips scale with row count and hold pool slots longer.',
    inspectNext: [
      'Replace with WHERE id = ANY($1), a JOIN, or a batched query.',
      'Confirm this is not a pagination or retry while-loop.',
    ],
  },
  'db.mongo.unbounded-find': {
    costWhy: 'find() without limit/skip can load an entire collection into the Node process.',
    inspectNext: [
      'Check callers for .limit() / pagination helpers not visible at this call site.',
      'Compare filter/sort fields to in-repo createIndex definitions.',
    ],
  },
  'db.pg.unbounded-select': {
    costWhy: 'SELECT without LIMIT/FETCH can return large result sets over the wire.',
    inspectNext: [
      'Confirm whether a view, wrapper, or driver default already bounds the query.',
      'Add LIMIT/OFFSET or keyset pagination if results are user-facing.',
    ],
  },
  'db.mongo.index-not-in-source': {
    costWhy:
      'No in-repo createIndex matches this query as a compound prefix (key order and sort direction). The live collection may still be indexed.',
    inspectNext: [
      'Compare equality prefix, range field, and sort direction with createIndex key order. A reverse scan flips every direction.',
      'This does not inspect Atlas. If createIndex is dynamic or lives outside the repo, this rule stays silent or is only a hint.',
    ],
  },
  'deps.lockfile-duplicate-version': {
    costWhy: 'Two resolved versions of one package increase install size and can bind different copies at runtime.',
    inspectNext: [
      'Open package-lock.json and see which dependents force the extra version.',
      'Deduplicate only when the ranges can share one version.',
    ],
  },
  'async.await-in-loop': {
    costWhy: 'Sequential awaits in a loop serialize latency; each iteration waits for the previous.',
    inspectNext: [
      'If iterations are independent, consider Promise.all with a concurrency cap.',
      'If a database query is inside the loop, treat this as a likely N+1.',
    ],
  },
  'async.sequential-independent-awaits': {
    costWhy: 'Independent awaits in one block add their latencies instead of overlapping I/O.',
    inspectNext: [
      'Confirm the second await does not use the first result.',
      'Parallelize with Promise.all only when there are no ordering or transaction constraints.',
    ],
  },
  'async.blocking-sync-in-handler': {
    costWhy: 'Synchronous fs/child_process calls block the event loop for every concurrent request.',
    inspectNext: [
      'Replace with async fs.promises or worker offload on the request path.',
      'Keep *Sync only in module-scope startup if needed.',
    ],
  },
  'deps.unused-production': {
    costWhy: 'Unused production dependencies inflate install time and the audit surface.',
    inspectNext: [
      'Confirm the package is not a CLI, native addon, or dynamic require.',
      'Remove it only after checking scripts and runtime loaders.',
    ],
  },
  'deps.dev-imported-in-source': {
    costWhy: 'Production installs omit devDependencies, so this import can fail at runtime.',
    inspectNext: ['Move the package to dependencies or keep the import out of production code.'],
  },
  'deps.test-tool-in-production': {
    costWhy: 'Test runners in dependencies ship extra packages to production.',
    inspectNext: ['Move the test tool to devDependencies unless the runtime truly needs it.'],
  },
  'deps.undeclared-import': {
    costWhy: 'An undeclared import depends on hoist/transitive luck and can break on install.',
    inspectNext: ['Declare the package in package.json or confirm it is a workspace package.'],
  },
};

export function guidanceForRule(ruleId: string): RuleGuidance {
  return BY_RULE[ruleId] ?? DEFAULT_GUIDANCE;
}
