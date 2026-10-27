import { guidanceForRule, knownRuleIds } from '../investigation/ruleGuidance.js';
import type { Finding } from '../types/index.js';
import type { RagChunk } from './retrieve.js';

const SNIPPET_LIMIT = 500;

export function ruleCatalogChunks(): RagChunk[] {
  return knownRuleIds().map((ruleId) => {
    const guidance = guidanceForRule(ruleId);
    return {
      id: `rule:${ruleId}`,
      source: 'rule-catalog',
      title: ruleId,
      ruleId,
      text: `${guidance.costWhy} Next: ${guidance.inspectNext.join(' ')}`,
    };
  });
}

export function findingChunks(findings: Finding[]): RagChunk[] {
  return findings.map((finding) => ({
    id: `finding:${finding.id}`,
    source: 'finding',
    title: finding.title,
    ruleId: finding.ruleId,
    text: [
      finding.ruleId,
      finding.description,
      finding.recommendation,
      finding.file ? `${finding.file}:${finding.line ?? ''}` : '',
      finding.evidence.snippet.slice(0, SNIPPET_LIMIT),
    ]
      .filter(Boolean)
      .join('\n'),
  }));
}
