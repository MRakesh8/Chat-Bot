import { Router } from "express";
import { db, crypto } from "@workspace/db";
import { whatsappConnections } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { WhatsAppProcessor } from "../../services/whatsapp/processor";
import { TimelinesAIProvider } from "../../services/whatsapp/providers/timelines";
import { MetaBusinessProvider } from "../../services/whatsapp/providers/meta";
import { logger } from "../../lib/logger";

const router = Router();

const providers = {
  timelinesai: new TimelinesAIProvider(),
  meta: new MetaBusinessProvider()
};

/**
 * Common Webhook Handler
 */
async function handleWebhook(providerName: string, req: any, res: any) {
  const connectionId = req.params.connectionId;
  if (!connectionId) {
    return res.status(400).send("Missing connection ID");
  }

  try {
    // 1. Resolve Connection
    const connection = await db.query.whatsappConnections.findFirst({
      where: and(
        eq(whatsappConnections.id, connectionId),
        eq(whatsappConnections.provider, providerName)
      )
    });

    if (!connection) {
      return res.status(403).send("Invalid connection");
    }

    const provider = providers[providerName as keyof typeof providers];
    if (!provider) {
      return res.status(400).send("Unknown provider");
    }

    let credentials = {};
    if (connection.encryptedCredentials) {
      try {
        credentials = JSON.parse(crypto.decrypt(connection.encryptedCredentials));
      } catch (e) {}
    }

    // 2. Validate Webhook (if provider requires signature check)
    const isValid = await provider.validateWebhook(req, credentials);
    if (!isValid) {
      return res.status(403).send("Webhook validation failed");
    }

    // 3. Parse Webhook Payload
    const normalizedMessages = await provider.parseWebhook(req.body, connection.id, connection.projectId);

    // 4. Enqueue messages and trigger processing
    for (const msg of normalizedMessages) {
      // Enforce strict tenant isolation: 
      // Ensure the providerAccountId in the payload matches our DB record
      // to prevent cross-tenant spoofing.
      if (msg.providerAccountId && connection.providerAccountId && msg.providerAccountId !== connection.providerAccountId) {
        logger.warn({ msg, connection }, "Provider Account ID mismatch in webhook. Dropping event.");
        continue;
      }
      
      const { enqueued, messageId } = await WhatsAppProcessor.enqueue(msg);
      
      if (enqueued && messageId) {
        // Fire and forget asynchronous processing
        WhatsAppProcessor.processMessage(messageId).catch(err => {
          logger.error({ err, messageId }, "Async processing failed");
        });
      }
    }

    // Always return 200 OK quickly for webhooks
    res.status(200).send("OK");

  } catch (err) {
    logger.error({ err, body: req.body }, `Failed to handle ${providerName} webhook`);
    res.status(500).send("Internal Server Error");
  }
}

// ------------------------------------------
// TimelinesAI Routes
// ------------------------------------------
router.post("/timelines/:connectionId/webhook", (req, res) => handleWebhook("timelinesai", req, res));

// ------------------------------------------
// Meta Business Routes
// ------------------------------------------
router.post("/meta/:connectionId/webhook", (req, res) => handleWebhook("meta", req, res));

// Meta typically requires a GET challenge for webhook verification
router.get("/meta/:connectionId/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  const connectionId = req.params.connectionId;

  if (mode && token) {
    if (mode === "subscribe") {
      // Find connection to verify token
      const connection = await db.query.whatsappConnections.findFirst({
        where: eq(whatsappConnections.id, connectionId)
      });
      if (connection && connection.webhookId === token) {
        return res.status(200).send(challenge);
      } else {
        return res.sendStatus(403);
      }
    }
  }
  return res.sendStatus(400);
});

export default router;
