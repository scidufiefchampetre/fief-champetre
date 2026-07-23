import { createAnthropic } from "@ai-sdk/anthropic";

// Fournisseur pour l'analyse de factures : Claude. Clé API classique sur
// https://console.anthropic.com/settings/keys
export function createAnthropicProvider(apiKey: string) {
  return createAnthropic({ apiKey });
}
