# Contributing to ai-backend-performance-mcp

Thank you for your interest in contributing!

## Getting started

1. Fork the repository
2. Create a feature branch
3. Install dependencies: `npm install`
4. Make your changes with tests
5. Run quality checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Pull request guidelines

- Keep changes focused and well-tested
- Add or update fixture projects for new analyzer rules
- Mark findings as `confirmed` only when evidence is definitive; use `potential` otherwise
- Do not add LLM-based analysis in v1
- Update documentation when adding tools or analyzers

## Code style

- TypeScript strict mode
- Prefer AST-based analysis over regex-only heuristics
- Small, testable functions with explicit types
- No modification of analyzed repositories (read-only analysis)

## Reporting issues

Include:

- Node.js version
- Project type (Express, Fastify, ORM, etc.)
- Sample code or fixture that reproduces the issue
- Expected vs actual finding
