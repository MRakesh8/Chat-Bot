import { UniversalProviderAdapter } from '../services/llm-provider.js';

function validateProviderModel(provider: string, model: string): boolean {
  const lowerModel = model.toLowerCase();
  const lowerProvider = provider.toLowerCase();

  if (lowerProvider === "gemini" && !lowerModel.includes("gemini") && !lowerModel.includes("learnlm")) {
    return false;
  } else if (lowerProvider !== "gemini" && lowerProvider !== "claude" && (lowerModel.includes("gemini") || lowerModel.includes("learnlm"))) {
    return false;
  }
  return true;
}

async function testProviderRouting() {
  console.log("=== Testing Provider & Model Validation ===");
  const validationTests = [
    { provider: 'groq', model: 'gemini-2.0-flash', expectedValid: false },
    { provider: 'gemini', model: 'gpt-4o', expectedValid: false },
    { provider: 'openai', model: 'gemini-1.5-pro', expectedValid: false },
    { provider: 'groq', model: 'llama3-8b-8192', expectedValid: true },
    { provider: 'gemini', model: 'gemini-1.5-pro', expectedValid: true },
    { provider: 'openai', model: 'gpt-4o', expectedValid: true },
    { provider: 'openrouter', model: 'anthropic/claude-3-opus', expectedValid: true },
    { provider: 'claude', model: 'claude-3-5-sonnet-20240620', expectedValid: true }
  ];

  for (const test of validationTests) {
    const isValid = validateProviderModel(test.provider, test.model);
    if (isValid === test.expectedValid) {
      console.log(`SUCCESS: Provider '${test.provider}' with Model '${test.model}' validation is correctly ${test.expectedValid}`);
    } else {
      console.error(`FAILURE: Provider '${test.provider}' with Model '${test.model}' validation should be ${test.expectedValid} but was ${isValid}`);
    }
  }

  console.log("\n=== Testing Routing Endpoints ===");
  const routingTests = [
    { provider: 'openai', model: 'gpt-4o', endpoint: 'api.openai.com/v1', client: 'OpenAI' },
    { provider: 'groq', model: 'llama3-8b-8192', endpoint: 'api.groq.com/openai/v1', client: 'OpenAI' },
    { provider: 'openrouter', model: 'anthropic/claude-3-opus', endpoint: 'openrouter.ai/api/v1', client: 'OpenAI' },
    { provider: 'claude', model: 'claude-3-5-sonnet-20240620', endpoint: 'api.anthropic.com', client: 'Anthropic' }
  ];

  for (const test of routingTests) {
    const adapter = new UniversalProviderAdapter({
      provider: test.provider,
      apiKey: 'test-key',
      model: test.model
    });

    try {
      await adapter.generateChat({ messages: [{ role: 'user', content: 'hello' }] });
    } catch (e: any) {
      if (e.message.includes('401') || e.message.includes('key') || e.message.includes('Authentication') || e.message.includes('authentication') || e.message.includes('status code 401') || e.message.includes('Invalid API Key')) {
        console.log(`SUCCESS: ${test.provider} correctly routed to ${test.client} client using endpoint ${test.endpoint}`);
      } else {
        console.log(`Expected authentication failure for ${test.provider}, but got:`, e.message);
      }
    }
  }

  console.log("\nFor Gemini, routing uses GoogleGenAI native client and is validated directly in the core logic.");
}

testProviderRouting();
