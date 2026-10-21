# Changelog

## 0.2.1

MongoDB index findings follow compound key order and sort direction, and stay potential. `package-lock.json` duplicate versions are reported instead of discarding the lockfile read. Source scans refuse symlink reads, cap total bytes, and record when a scan stops early.

## 0.2.0

Investigation layer: enriched findings (code path, technology, related IDs, inspect-next catalogs) and a deterministic `investigate_performance` MCP tool. No LLM.

## 0.1.0

Initial MCP server for Node.js backend performance static analysis: six tools, stdio transport, and production packaging (local Cursor binary plus npm publish on `v*` tags).
