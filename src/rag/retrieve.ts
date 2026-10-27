export interface RagChunk {
  id: string;
  source: 'rule-catalog' | 'finding';
  title: string;
  text: string;
  ruleId?: string;
}

export interface RetrievedChunk extends RagChunk {
  score: number;
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'what',
  'with',
]);

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9+_.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/**
 * Lexical retrieval over rule cards and findings. This is the retrieval step of RAG:
 * the generator only sees the chunks returned here.
 */
export function retrieveChunks(chunks: RagChunk[], query: string, limit = 6): RetrievedChunk[] {
  const queryTokens = tokens(query);
  if (chunks.length === 0 || limit <= 0) {
    return [];
  }

  const documentFrequency = new Map<string, number>();
  const chunkTokens = chunks.map((chunk) => tokens(`${chunk.title} ${chunk.text} ${chunk.ruleId ?? ''}`));
  for (const tokensInChunk of chunkTokens) {
    for (const token of new Set(tokensInChunk)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const scored = chunks.map((chunk, index) => {
    const terms = chunkTokens[index] ?? [];
    if (queryTokens.length === 0) {
      return { ...chunk, score: 0 };
    }
    const termFrequency = new Map<string, number>();
    for (const term of terms) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }
    let score = 0;
    for (const term of queryTokens) {
      const tf = termFrequency.get(term) ?? 0;
      if (tf === 0) {
        continue;
      }
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log((chunks.length + 1) / (df + 1)) + 1;
      score += tf * idf;
    }
    return { ...chunk, score };
  });

  return scored
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, limit);
}
