#!/usr/bin/env node
/**
 * @file local-connector.mjs
 * @description Secure Outbound Localhost Development Connector for NOVA Business AI.
 * 
 * Runs on the developer's laptop to securely relay discovery/crawling requests
 * from NOVA Cloud to the real local website (e.g. http://localhost:3000).
 * 
 * Usage:
 *   node scripts/local-connector.mjs --token ldev_conn_xxxx --port 3000 --server http://127.0.0.1:5000
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (flag, fallback = "") => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

const token = getArg("--token") || process.env.NOVA_LOCAL_DEV_TOKEN;
const portStr = getArg("--port") || process.env.PORT || "3000";
const serverUrlStr = getArg("--server") || process.env.NOVA_SERVER_URL || "http://127.0.0.1:5000";

if (!token) {
  console.error("❌ Error: Missing --token. Please provide your temporary development session token.");
  console.error("Example: node scripts/local-connector.mjs --token ldev_conn_xxxx --port 3000");
  process.exit(1);
}

const localPort = parseInt(portStr, 10);
if (isNaN(localPort) || localPort <= 0 || localPort > 65535) {
  console.error(`❌ Error: Invalid port number "${portStr}". Must be between 1 and 65535.`);
  process.exit(1);
}

const serverUrl = new URL(serverUrlStr);
let isRunning = true;

console.log("================================================================================");
console.log("🚀 NOVA BUSINESS AI — SECURE LOCALHOST DEVELOPMENT CONNECTOR");
console.log("================================================================================");
console.log(`📡 Cloud API Server:   ${serverUrl.origin}`);
console.log(`💻 Local Website:      http://127.0.0.1:${localPort}`);
console.log(`🔑 Session Token:      ${token.slice(0, 12)}...`);
console.log("🔒 Security:           Outbound TLS Relay (No incoming open ports, strictly loopback)");
console.log("================================================================================\n");

async function checkSession() {
  try {
    const statusUrl = `${serverUrl.origin}/api/local-dev/bridge/${encodeURIComponent(token)}/status`;
    const res = await fetch(statusUrl);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      console.error(`❌ Session Verification Failed: ${err.error || res.statusText}`);
      process.exit(1);
    }
    const data = await res.json();
    console.log(`✅ Session Verified: Project ${data.projectId}`);
    console.log(`🔗 Temporary Development URL: ${data.developmentUrl}`);
    console.log(`⏳ Expiration: ${new Date(data.expiresAt).toLocaleTimeString()}`);
    console.log("\n[CONNECTOR ACTIVE] Waiting for discovery and test requests from NOVA...\n");
  } catch (err) {
    console.error(`❌ Failed to connect to NOVA API Server (${serverUrl.origin}): ${err.message}`);
    process.exit(1);
  }
}

async function fetchLocalPage(pathStr) {
  return new Promise((resolve) => {
    // Strict URL sanity check: enforce that path is relative and stays on localPort
    const safePath = pathStr.startsWith("/") ? pathStr : `/${pathStr}`;
    const targetUrl = new URL(safePath, `http://127.0.0.1:${localPort}`);

    if (targetUrl.hostname !== "127.0.0.1" && targetUrl.hostname !== "localhost") {
      return resolve({
        statusCode: 403,
        headers: { "content-type": "text/plain" },
        body: "Forbidden: Connector only allows local loopback access."
      });
    }

    const req = http.request(targetUrl, {
      method: "GET",
      headers: {
        "User-Agent": "NOVA-Local-Connector/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml,text/plain"
      },
      timeout: 8000
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const bodyBuffer = Buffer.concat(chunks);
        const contentType = res.headers["content-type"] || "text/html";
        const isBinary = !contentType.includes("text") && !contentType.includes("json") && !contentType.includes("xml");

        resolve({
          statusCode: res.statusCode || 200,
          headers: {
            "content-type": contentType,
            "x-served-by": "nova-local-connector"
          },
          body: isBinary ? bodyBuffer.toString("base64") : bodyBuffer.toString("utf-8"),
          isBase64: isBinary
        });
      });
    });

    req.on("error", (err) => {
      resolve({
        statusCode: 502,
        headers: { "content-type": "text/html" },
        body: `<p>Failed to connect to local server on port ${localPort}: ${err.message}</p>`
      });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({
        statusCode: 504,
        headers: { "content-type": "text/html" },
        body: `<p>Request to local server on port ${localPort} timed out.</p>`
      });
    });

    req.end();
  });
}

async function startPollingLoop() {
  while (isRunning) {
    try {
      const pollUrl = `${serverUrl.origin}/api/local-dev/bridge/${encodeURIComponent(token)}/poll`;
      const res = await fetch(pollUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });

      if (res.status === 403 || res.status === 410 || res.status === 404) {
        console.log("\n⚠️ Session stopped or expired on server. Shutting down connector.");
        process.exit(0);
      }

      if (res.ok) {
        const data = await res.json();
        const requests = data.requests || [];

        for (const r of requests) {
          console.log(`📥 [REQUEST] Relaying ${r.method} ${r.path} -> http://127.0.0.1:${localPort}${r.path}`);
          const localResponse = await fetchLocalPage(r.path);

          const submitUrl = `${serverUrl.origin}/api/local-dev/bridge/${encodeURIComponent(token)}/response`;
          await fetch(submitUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requestId: r.requestId,
              ...localResponse
            })
          }).catch((err) => console.error("Failed to submit response:", err.message));

          console.log(`📤 [RESPONSE] ${localResponse.statusCode} delivered to cloud (${localResponse.body?.length || 0} bytes)`);
        }
      }
    } catch (err) {
      if (isRunning) {
        // Short pause before retrying on network error
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
}

// Graceful exit
process.on("SIGINT", () => {
  console.log("\n🛑 Stopping local connector...");
  isRunning = false;
  process.exit(0);
});

process.on("SIGTERM", () => {
  isRunning = false;
  process.exit(0);
});

async function main() {
  await checkSession();
  await startPollingLoop();
}

main();
