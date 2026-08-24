# Sample Node API

This example project intentionally contains performance anti-patterns for demonstration and testing of `ai-backend-performance-mcp`.

## Intentional issues

| File | Issue |
|------|-------|
| `src/server.js` | MongoClient created per request |
| `src/users.js` | N+1 queries in a loop |
| `src/orders.js` | Query on `status` without matching index |
| `src/dashboard.js` | Sequential independent awaits |

Run analysis:

```bash
npx ai-backend-performance-mcp
```

Then invoke the `analyze_project` tool with `projectPath` set to this directory.
