import { IntegrationProvider, ToolDefinition } from "../provider-registry";
import dns from "dns/promises";

export class ShopifyProvider implements IntegrationProvider {
  providerId = "shopify";

  private async isSsrfSafe(hostname: string): Promise<boolean> {
    // Basic string checks
    if (!hostname.endsWith(".myshopify.com")) return false;
    if (hostname.includes("localhost") || hostname.includes("127.0.0.1") || hostname.includes("::1")) return false;

    // Resolve IP to prevent DNS rebinding to internal addresses
    try {
      const records = await dns.lookup(hostname);
      const ip = records.address;
      
      // Prevent private IPv4 and metadata IPs
      if (
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        ip.startsWith("169.254.") ||
        ip.startsWith("127.") ||
        ip.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./) ||
        ip === "::1" ||
        ip.startsWith("fe80:") ||
        ip.startsWith("fd") ||
        ip.startsWith("fc")
      ) {
        return false;
      }
      return true;
    } catch {
      return false; // Fail closed if DNS fails
    }
  }

  private async safeFetch(url: string, options: RequestInit): Promise<Response> {
    const targetUrl = new URL(url);
    const isSafe = await this.isSsrfSafe(targetUrl.hostname);
    if (!isSafe) {
      throw new Error("SSRF Protection: Target domain or IP is blocked.");
    }

    // Explicitly prevent following redirects to prevent SSRF via 301/302
    const safeOptions: RequestInit = {
      ...options,
      redirect: "manual",
    };

    const response = await fetch(targetUrl.toString(), safeOptions);
    
    // If we receive a redirect status, reject it outright
    if (response.status >= 300 && response.status < 400) {
      throw new Error("SSRF Protection: Redirects are not permitted for this provider.");
    }

    return response;
  }

  async verifyCredentials(credentials: any): Promise<boolean> {
    const { shop, accessToken } = credentials;
    if (!shop || !accessToken) {
      throw new Error("Missing shop or accessToken");
    }

    try {
      const response = await this.safeFetch(`https://${shop}/admin/api/2024-01/shop.json`, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
      });

      return response.ok;
    } catch (e) {
      return false;
    }
  }

  getAvailableTools(): ToolDefinition[] {
    return [
      {
        actionName: "shopify_get_products",
        description: "Retrieve a list of products from the Shopify store.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of products to return (default 50)" }
          }
        },
        outputSchema: {
          type: "object",
          properties: {
            products: { type: "array" }
          }
        },
        riskLevel: "READ_ONLY",
      },
      {
        actionName: "shopify_get_orders",
        description: "Retrieve a list of orders from the Shopify store.",
        inputSchema: {
          type: "object",
          properties: {
            limit: { type: "number", description: "Maximum number of orders to return (default 50)" }
          }
        },
        outputSchema: {
          type: "object",
          properties: {
            orders: { type: "array" }
          }
        },
        riskLevel: "READ_ONLY",
      }
    ];
  }

  async executeTool(actionName: string, input: any, credentials: any): Promise<any> {
    const { shop, accessToken } = credentials;
    if (!shop || !accessToken) {
      throw new Error("Missing shop or accessToken");
    }

    if (actionName === "shopify_get_products") {
      const limit = input.limit || 50;
      const response = await this.safeFetch(`https://${shop}/admin/api/2024-01/products.json?limit=${limit}`, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        }
      });
      if (!response.ok) throw new Error(`Shopify API error: ${response.statusText}`);
      return await response.json();
    }

    if (actionName === "shopify_get_orders") {
      const limit = input.limit || 50;
      const response = await this.safeFetch(`https://${shop}/admin/api/2024-01/orders.json?status=any&limit=${limit}`, {
        method: "GET",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        }
      });
      if (!response.ok) throw new Error(`Shopify API error: ${response.statusText}`);
      const data: any = await response.json();

      // Customer-Scoped Execution: Enforce real customer ownership validation
      if (input.customerScope?.isCustomerScoped) {
        const scope = input.customerScope;
        if (!scope.verified || (!scope.email && !scope.customerId && !scope.phone)) {
          throw new Error("Access denied: Unauthenticated customer access to customer-private tool blocked.");
        }

        const targetEmail = (scope.email || "").toLowerCase();
        const targetCustId = scope.customerId ? String(scope.customerId) : "";

        // Filter orders by verified customer identity
        const customerOrders = (data.orders || []).filter((ord: any) => {
          const ordEmail = (ord.email || ord.customer?.email || "").toLowerCase();
          const ordCustId = ord.customer?.id ? String(ord.customer.id) : "";
          if (targetEmail && ordEmail === targetEmail) return true;
          if (targetCustId && ordCustId === targetCustId) return true;
          return false;
        });

        // If a specific target orderId was requested, verify that the requested order belongs to the caller
        if (input.orderId) {
          const requestedOrderIdStr = String(input.orderId);
          const matchedOrder = customerOrders.find(
            (ord: any) => String(ord.id) === requestedOrderIdStr || String(ord.order_number) === requestedOrderIdStr || ord.name === requestedOrderIdStr
          );
          if (!matchedOrder) {
            throw new Error(`Access denied: Target order ${input.orderId} does not belong to the current verified customer.`);
          }
          return { orders: [matchedOrder] };
        }

        return { orders: customerOrders };
      }

      return data;
    }

    throw new Error(`Action ${actionName} is not supported by ShopifyProvider`);
  }
}
