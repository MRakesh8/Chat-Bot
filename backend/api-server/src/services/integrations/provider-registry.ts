import { z } from "zod";

export interface ToolDefinition {
  actionName: string;
  description: string;
  inputSchema: any;
  outputSchema: any;
  riskLevel: "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";
}

export interface IntegrationProvider {
  /**
   * Identifies the provider uniquely (e.g. 'shopify', 'hubspot')
   */
  providerId: string;

  /**
   * Verifies the given credentials against the provider API.
   * Throws an error or returns false if invalid.
   */
  verifyCredentials(credentials: any): Promise<boolean>;

  /**
   * Returns the server-controlled fixed list of tools available for this provider.
   */
  getAvailableTools(): ToolDefinition[];

  /**
   * Executes a specific tool action using the provided credentials.
   * Input is guaranteed to have passed the tool's inputSchema validation.
   */
  executeTool(
    actionName: string,
    input: any,
    credentials: any
  ): Promise<any>;
}

class ProviderRegistry {
  private providers: Map<string, IntegrationProvider> = new Map();

  register(provider: IntegrationProvider) {
    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider ${provider.providerId} is already registered.`);
    }
    this.providers.set(provider.providerId, provider);
  }

  getProvider(providerId: string): IntegrationProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider ${providerId} not found in registry.`);
    }
    return provider;
  }

  hasProvider(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  getAllProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const providerRegistry = new ProviderRegistry();
