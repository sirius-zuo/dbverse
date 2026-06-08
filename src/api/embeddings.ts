import { invoke } from "@tauri-apps/api/core";

export interface EmbeddingResponse {
  vector: number[];
  model: string;
  dimensions: number;
}

export function embedTextOpenAI(
  apiKey: string,
  model: string,
  input: string
): Promise<EmbeddingResponse> {
  return invoke<EmbeddingResponse>("embed_text_openai", {
    apiKey,
    model,
    input,
  });
}
