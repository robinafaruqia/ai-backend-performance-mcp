export interface LlmMessage {
  role: 'system' | 'user';
  content: string;
}

export interface LlmClient {
  complete(messages: LlmMessage[]): Promise<string>;
}

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function llmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const apiKey = env['PERFORMANCE_MCP_LLM_API_KEY']?.trim();
  const baseUrl = env['PERFORMANCE_MCP_LLM_BASE_URL']?.trim();
  const model = env['PERFORMANCE_MCP_LLM_MODEL']?.trim() || 'gpt-4o-mini';
  if (!apiKey || !baseUrl) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiKey, model };
}

export function createOpenAiCompatibleClient(config: LlmConfig, fetchImpl: typeof fetch = fetch): LlmClient {
  return {
    async complete(messages: LlmMessage[]): Promise<string> {
      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0,
          messages,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) {
        throw new Error(`LLM request failed (${response.status})`);
      }
      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
        throw new Error('LLM returned an empty completion');
      }
      return content.trim();
    },
  };
}

export function llmClientFromEnv(env: NodeJS.ProcessEnv = process.env): LlmClient | null {
  const config = llmConfigFromEnv(env);
  if (!config) {
    return null;
  }
  return createOpenAiCompatibleClient(config);
}
