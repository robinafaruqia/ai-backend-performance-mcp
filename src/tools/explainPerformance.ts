import { createAnalysisEngine, type AnalysisEngine } from '../analysisEngine.js';
import { buildSummary } from '../models/Finding.js';
import { filterByMinSeverity, type AnalysisRequest } from '../models/severity.js';
import { findingChunks, ruleCatalogChunks } from '../rag/buildChunks.js';
import { retrieveChunks } from '../rag/retrieve.js';
import { llmClientFromEnv, type LlmClient } from '../llm/client.js';
import { answerFromRetrieval, buildExplanationMessages } from '../llm/explain.js';

export interface ExplainPerformanceOptions extends AnalysisRequest {
  question?: string;
  engine?: AnalysisEngine;
  /** Inject a client in tests. `null` forces the retrieved-only answer. */
  llm?: LlmClient | null;
  /** When true and `llm` is omitted, use PERFORMANCE_MCP_LLM_* from the environment. */
  useEnv?: boolean;
}

const DEFAULT_QUESTION =
  'What are the highest severity performance issues and what should be inspected next?';

export async function explainPerformance(projectPath: string, options: ExplainPerformanceOptions = {}) {
  const engine = options.engine ?? createAnalysisEngine();
  const context = await engine.loadContext(projectPath);
  const findings = filterByMinSeverity(await engine.runAll(context), options.minSeverity);
  const question = options.question?.trim() || DEFAULT_QUESTION;
  const retrieval = retrieveChunks([...ruleCatalogChunks(), ...findingChunks(findings)], question, 6);

  const llm =
    options.llm !== undefined ? options.llm : options.useEnv ? llmClientFromEnv() : null;

  let mode: 'llm' | 'retrieved-only' = 'retrieved-only';
  let answer = answerFromRetrieval(question, retrieval);
  let llmError: string | undefined;
  if (llm) {
    try {
      answer = await llm.complete(buildExplanationMessages(question, retrieval));
      mode = 'llm';
    } catch (error) {
      llmError = error instanceof Error ? error.message : 'LLM request failed';
    }
  }

  return {
    projectPath: context.projectPath,
    mode,
    question,
    answer,
    llmError,
    retrieval: retrieval.map((passage) => ({
      id: passage.id,
      source: passage.source,
      title: passage.title,
      ruleId: passage.ruleId,
      score: Number(passage.score.toFixed(4)),
      excerpt: passage.text.slice(0, 240),
    })),
    findings,
    summary: buildSummary(findings),
  };
}
