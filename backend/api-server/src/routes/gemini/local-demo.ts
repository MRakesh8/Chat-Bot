import { Router } from "express";

const router = Router();
const now = () => new Date().toISOString();

type Conversation = {
  id: number;
  title: string;
  userId: string | null;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
};

type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  fileIds: string | null;
  createdAt: string;
};

const conversations = new Map<number, Conversation>();
const messages = new Map<number, Message[]>();
let nextConversationId = 2;
let nextMessageId = 3;

const seedConversation: Conversation = {
  id: 1,
  title: "Local Demo Chat",
  userId: "local-demo-user",
  projectId: null,
  createdAt: now(),
  updatedAt: now(),
};

conversations.set(1, seedConversation);
messages.set(1, [
  {
    id: 1,
    conversationId: 1,
    role: "assistant",
    content:
      "Local demo mode is running. Add your real Replit Secrets later to enable Clerk, PostgreSQL, and Gemini.",
    fileIds: null,
    createdAt: now(),
  },
]);

function getConversation(id: number) {
  return conversations.get(id);
}

function getMessages(id: number) {
  return messages.get(id) ?? [];
}

router.get("/conversations/search", (req, res) => {
  const q = String(req.query.q ?? "").toLowerCase();
  res.json(
    [...conversations.values()].filter((conversation) =>
      conversation.title.toLowerCase().includes(q),
    ),
  );
});

router.get("/conversations", (_req, res) => {
  res.json([...conversations.values()].sort((a, b) => b.id - a.id));
});

router.post("/conversations", (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title : "New Chat";
  const conversation: Conversation = {
    id: nextConversationId++,
    title,
    userId: "local-demo-user",
    projectId: null,
    createdAt: now(),
    updatedAt: now(),
  };
  conversations.set(conversation.id, conversation);
  messages.set(conversation.id, []);
  res.status(201).json(conversation);
});

router.get("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json({ ...conversation, messages: getMessages(id) });
});

router.patch("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  const conversation = getConversation(id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  conversation.title = typeof req.body?.title === "string" ? req.body.title : conversation.title;
  conversation.updatedAt = now();
  res.json(conversation);
});

router.delete("/conversations/:id", (req, res) => {
  const id = Number(req.params.id);
  conversations.delete(id);
  messages.delete(id);
  res.status(204).send();
});

router.get("/conversations/:id/messages", (req, res) => {
  res.json(getMessages(Number(req.params.id)));
});

router.post("/conversations/:id/messages", (req, res) => {
  const conversationId = Number(req.params.id);
  const conversation = getConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const content = typeof req.body?.content === "string" ? req.body.content : "";
  const list = getMessages(conversationId);
  list.push({
    id: nextMessageId++,
    conversationId,
    role: "user",
    content,
    fileIds: null,
    createdAt: now(),
  });

  const reply =
    "Demo reply: I received your message locally. To get real AI answers, put your Gemini API key in .env and turn LOCAL_DEMO_MODE=false.";
  list.push({
    id: nextMessageId++,
    conversationId,
    role: "assistant",
    content: reply,
    fileIds: null,
    createdAt: now(),
  });
  messages.set(conversationId, list);
  conversation.updatedAt = now();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.write(`data: ${JSON.stringify({ content: reply })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
