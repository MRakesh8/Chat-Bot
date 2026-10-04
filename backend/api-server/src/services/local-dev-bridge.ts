/**
 * @file local-dev-bridge.ts
 * @description In-memory request dispatcher for the Secure Localhost Development Connector Bridge.
 * Relays discovery/crawler HTTP GET requests from NOVA backend to the user's outbound local connector.
 */
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";

export interface PendingBridgeRequest {
  requestId: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  createdAt: number;
}

export interface BridgeResponsePayload {
  requestId: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string; // Base64 or UTF-8 text
  isBase64?: boolean;
}

interface ActiveBridgeSession {
  sessionToken: string;
  projectId: string;
  organizationId: string;
  localUrl: string;
  lastPollAt: number;
  pendingRequests: Map<string, {
    req: PendingBridgeRequest;
    resolve: (res: BridgeResponsePayload) => void;
    reject: (err: Error) => void;
    timer: NodeJS.Timeout;
  }>;
  pollResolver?: (reqs: PendingBridgeRequest[]) => void;
}

class LocalDevBridgeManager {
  private sessions = new Map<string, ActiveBridgeSession>();

  /**
   * Register or touch an active bridge session
   */
  public registerSession(sessionToken: string, projectId: string, organizationId: string, localUrl: string) {
    let session = this.sessions.get(sessionToken);
    if (!session) {
      session = {
        sessionToken,
        projectId,
        organizationId,
        localUrl,
        lastPollAt: Date.now(),
        pendingRequests: new Map()
      };
      this.sessions.set(sessionToken, session);
    } else {
      session.lastPollAt = Date.now();
      session.localUrl = localUrl;
    }
    return session;
  }

  /**
   * Remove / revoke a bridge session
   */
  public revokeSession(sessionToken: string) {
    const session = this.sessions.get(sessionToken);
    if (session) {
      // Reject any pending requests with friendly error
      session.pendingRequests.forEach(({ reject, timer }) => {
        clearTimeout(timer);
        reject(new Error("Local development session was stopped."));
      });
      session.pendingRequests.clear();
      if (session.pollResolver) {
        session.pollResolver([]);
        session.pollResolver = undefined;
      }
      this.sessions.delete(sessionToken);
    }
  }

  /**
   * Called by local connector CLI to wait for incoming fetch tasks (long-polling)
   */
  public async pollRequests(sessionToken: string, timeoutMs = 25000): Promise<PendingBridgeRequest[]> {
    const session = this.sessions.get(sessionToken);
    if (!session) {
      return [];
    }

    session.lastPollAt = Date.now();

    // If there are already pending requests queued
    const existing = Array.from(session.pendingRequests.values())
      .filter(({ req }) => Date.now() - req.createdAt < 10000)
      .map(({ req }) => req);

    if (existing.length > 0) {
      return existing;
    }

    // Otherwise wait for incoming request or timeout
    return new Promise<PendingBridgeRequest[]>((resolve) => {
      const timer = setTimeout(() => {
        if (session.pollResolver) {
          session.pollResolver = undefined;
        }
        resolve([]);
      }, timeoutMs);

      session.pollResolver = (reqs: PendingBridgeRequest[]) => {
        clearTimeout(timer);
        resolve(reqs);
      };
    });
  }

  /**
   * Called by NOVA Cloud (proxy/discovery) to dispatch a request to the local website
   */
  public async dispatchFetch(
    sessionToken: string, 
    pathStr: string, 
    headers: Record<string, string> = {},
    timeoutMs = 12000
  ): Promise<BridgeResponsePayload> {
    const session = this.sessions.get(sessionToken);
    if (!session) {
      throw new Error("Local development connector is not connected. Start your local connector to test.");
    }

    // Check if connector was recently active (within last 35 seconds)
    if (Date.now() - session.lastPollAt > 35000) {
      throw new Error("Local development connector is offline or timed out. Please verify the local runner is running.");
    }

    const requestId = "req_" + randomUUID();
    const cleanPath = pathStr.startsWith("/") ? pathStr : `/${pathStr}`;

    return new Promise<BridgeResponsePayload>((resolve, reject) => {
      const timer = setTimeout(() => {
        session.pendingRequests.delete(requestId);
        reject(new Error("Local development website request timed out. Make sure your local server is running."));
      }, timeoutMs);

      const pendingReq: PendingBridgeRequest = {
        requestId,
        path: cleanPath,
        method: "GET",
        headers,
        createdAt: Date.now()
      };

      session.pendingRequests.set(requestId, {
        req: pendingReq,
        resolve: (res) => {
          clearTimeout(timer);
          session.pendingRequests.delete(requestId);
          resolve(res);
        },
        reject: (err) => {
          clearTimeout(timer);
          session.pendingRequests.delete(requestId);
          reject(err);
        },
        timer
      });

      // If connector is actively polling, notify immediately
      if (session.pollResolver) {
        const resolver = session.pollResolver;
        session.pollResolver = undefined;
        resolver([pendingReq]);
      }
    });
  }

  /**
   * Called by local connector CLI to fulfill a pending request
   */
  public submitResponse(sessionToken: string, payload: BridgeResponsePayload): boolean {
    const session = this.sessions.get(sessionToken);
    if (!session) return false;

    session.lastPollAt = Date.now();
    const pending = session.pendingRequests.get(payload.requestId);
    if (!pending) return false;

    pending.resolve(payload);
    return true;
  }

  /**
   * Check if connector is currently live
   */
  public isConnected(sessionToken: string): boolean {
    const session = this.sessions.get(sessionToken);
    if (!session) return false;
    return Date.now() - session.lastPollAt <= 35000;
  }
}

export const localDevBridge = new LocalDevBridgeManager();
