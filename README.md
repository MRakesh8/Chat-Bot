<div align="center">

# 🤖 NOVA Business AI — Intelligent Business Chatbot Platform

**From Conversations to Business Actions.**  
A full-featured AI assistant that learns from your content, speaks in your brand's voice, and can live on any website — in under a minute.

<br />

[![Live](https://img.shields.io/badge/Live-chatbot--rakesh.vercel.app-8b5cf6?style=flat-square&logo=vercel&logoColor=white)](https://chatbot-rakesh.vercel.app)
[![AI](https://img.shields.io/badge/AI-Gemini_·_OpenAI_·_Claude_·_Groq-4f46e5?style=flat-square&logo=google&logoColor=white)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-Fullstack-3178c6?style=flat-square&logo=typescript&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-0f172a?style=flat-square)](#)

<br />

**[🚀 Try It Live](https://chatbot-rakesh.vercel.app)** &nbsp;·&nbsp; **[✨ Features](#-features)** &nbsp;·&nbsp; **[🛠️ Tech Stack](#%EF%B8%8F-technology-stack)** &nbsp;·&nbsp; **[⚡ Quick Start](#-quick-start)**

</div>

---

## 💡 What is NOVA Business AI?

**NOVA Business AI** is a production-ready AI chatbot platform that is smart, brand-aware, and deployable anywhere. Unlike generic chat tools, NOVA Business AI learns from *your* content — your documents, your website, your videos — and uses that knowledge to give precise, relevant answers.

You get a beautiful chat interface, a knowledge base you can train, an embeddable widget for external websites, and the flexibility to switch between the world's best AI models — all in one platform.

---

## ✨ Features

### 💬 Intelligent Conversations

Every conversation in NOVA Business AI is powered by state-of-the-art AI. Here is what makes it stand out:

#### 🌊 Real-Time Streaming Responses
NOVA AI doesn't make you wait. As the AI generates its response, the text flows into the chat window **word-by-word in real time** — just like a human typing. There's no spinner, no loading delay. The moment the AI starts thinking, you start reading.

#### 🧠 Context-Aware Memory
NOVA AI remembers everything said in a conversation. Every message you send carries the full history of that session, so the AI always understands the context — no need to repeat yourself or re-explain previous points.

#### 🤖 Multi-LLM Model Switching
You are not locked into one AI. NOVA Business AI connects to a **universal AI adapter** that supports:

| Provider | Example Models |
|:---|:---|
| 🟣 **Google Gemini** | `gemini-2.5-flash`, `gemini-1.5-pro` |
| 🟢 **OpenAI** | `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| 🟠 **Anthropic Claude** | `claude-3-5-sonnet`, `claude-3-opus` |
| 🔵 **Groq** | `llama-3-70b`, `mixtral-8x7b` |
| ⚪ **DeepSeek** | `deepseek-chat`, `deepseek-coder` |
| 🌐 **OpenRouter** | Any model via OpenRouter's unified API |

Switch the model you use per conversation from a dropdown — no configuration files, no code changes.

#### 💡 Automatic Follow-up Suggestions
After every AI response, NOVA AI generates **3 intelligent follow-up questions** based on the conversation context. These appear as clickable suggestion chips beneath the response, helping you explore a topic deeper with one click.

#### 🔄 Message Regeneration
Not happy with an answer? Click the **Regenerate** button on any AI response to get a fresh answer. NOVA AI resends the same prompt and produces a new response — useful when you want a different angle or a more concise reply.

---

### 🧩 Knowledge Base — Train Your AI on Your Own Content

The Knowledge Base is what makes NOVA Business AI uniquely *yours*. Instead of relying purely on the AI's general training, you can feed NOVA AI your own documents, links, and notes. When you chat, NOVA AI retrieves the most relevant pieces of your knowledge and weaves them into its response.

#### How It Works
> You add content → NOVA AI reads and understands it → When you ask a question, NOVA AI finds the most relevant knowledge → That context is included in the AI's response automatically.

This technique is called **RAG (Retrieval-Augmented Generation)** and it's what allows NOVA Business AI to answer questions about *your specific business, product, or domain* — not just general knowledge.

#### What You Can Add to the Knowledge Base

**📄 Documents & Files**
Upload files directly from your computer. NOVA AI automatically extracts all readable text from:
- PDF documents
- Word files (`.docx`, `.doc`)
- Markdown (`.md`) and plain text (`.txt`)
- Spreadsheets (`.csv`, `.xls`, `.xlsx`)
- Presentations (`.pptx`, `.ppt`)
- Source code files (`.js`, `.ts`, `.py`, `.html`, `.css`, `.json`, `.sql`, and more)
- ZIP archives containing any of the above

**🖼️ Images, Audio & Video**
Upload media files directly. NOVA AI uses Google Gemini's multimodal capabilities to analyze image content, process audio, and understand video — extracting useful information even from non-text formats.

**🌐 Website URLs**
Paste any website URL. NOVA AI opens a headless browser behind the scenes, visits the page, reads its full visible text content, and adds it to your knowledge base. This works on most public websites — blogs, docs, landing pages, and more.

**🎬 YouTube Videos**
Paste a YouTube video link. NOVA AI automatically fetches the complete transcript of the video and indexes it. This means you can "chat with a video" — ask questions about what was said and get accurate answers referencing the video content.

**💻 GitHub Repositories**
Paste a GitHub repository URL. NOVA AI clones the repo and indexes the source code and documentation, making it possible to ask questions like *"How does the authentication flow work?"* or *"What does this function do?"* directly in chat.

**📸 Instagram Posts**
Paste an Instagram post link and NOVA AI extracts and indexes its content for knowledge retrieval.

**📝 Text Notes**
Prefer to write directly? Paste any raw text or markdown into the knowledge base as a manual note. Perfect for FAQs, onboarding guides, product descriptions, or any content you want NOVA AI to know about.

#### 📁 Knowledge Categories
Organize your knowledge into **named categories** — for example: "Product Docs", "Support FAQs", "Marketing Copy". Categories help keep large knowledge bases structured and manageable.

---

### 🎨 Widget Studio — Build Your Own AI Widget

The Widget Studio is a **no-code, visual builder** for creating a chatbot that you can embed on any external website. What you design here becomes a floating chat button and popup that your website visitors can talk to.

#### Visual Customization
Every visual aspect of the widget is configurable without writing a single line of CSS:
- **Bot Name & Subtitle** — Set the display name and status line (e.g., "NOVA AI", "Online 24/7")
- **Greeting Message** — The first message visitors see when they open the chat
- **Input Placeholder** — The hint text shown in the message input box
- **Accent Color** — The primary brand color used for the header, buttons, and highlights
- **Position** — Place the widget in any corner of the screen (bottom-right, bottom-left, etc.)

#### Live Preview Across All Devices
As you make changes, a **live preview panel** shows exactly how your widget will look — you can switch between **Desktop**, **Tablet**, and **Mobile** viewports to verify the design on every screen size before publishing.

#### Advanced: Custom CSS Editor
For developers who want pixel-perfect control, there's a built-in **scoped CSS editor** with syntax validation and linting. Write custom CSS rules that target specific widget elements to override any default style. Changes are scoped so they only affect your widget and never bleed into the parent website's styles.

#### Behavior Configuration
Toggle advanced behaviors on or off:
- Show or hide **message timestamps**
- Enable or disable the **typing indicator** animation while the AI is thinking
- Turn on **sound notifications** for new messages
- Add an optional **user feedback** thumbs up/down button to each response
- Enable a **lead capture form** that collects the visitor's name and email before the conversation starts
- Control whether **conversation history** is shown to returning visitors

#### Import & Export
Save your entire widget configuration as a **JSON file** and restore it at any time. Useful for backing up a design or sharing a configuration between projects.

---

### 🚀 Embeddable Widget — One Script, Any Website

Once your widget is designed, deploying it to any website takes **less than a minute**. You get a single HTML snippet from the Deployment panel:

```html
<!-- Paste this before </body> on any webpage -->
<script
  src="https://chatbot-rakesh.vercel.app/widget.js"
  data-widget-token="YOUR_UNIQUE_TOKEN">
</script>
```

Paste it before the closing `</body>` tag of any HTML page and the widget appears automatically. It's fully self-contained — no other libraries or dependencies required on the host website.

#### Domain Control
For security, you can configure exactly which website domains are allowed to load your widget. Any unlisted domain will be blocked from accessing the AI, ensuring your widget is only used on your own sites.

---

### 📊 Widget Analytics & Lead Capture

Once your widget is live on a website, NOVA Business AI tracks how people are engaging with it through a built-in analytics dashboard.

#### What Gets Tracked

| Metric | What It Tells You |
|:---|:---|
| 💬 **Total Conversations** | How many chat sessions were started via your embedded widget |
| 📨 **Total Messages** | The total volume of messages exchanged through the widget |
| 👥 **Unique Visitors** | How many distinct people have chatted with your AI assistant |
| ⚡ **Token Usage** | How many AI tokens your widget has consumed across all conversations |
| 💰 **Estimated AI Cost** | An estimate of the AI processing cost based on token usage |

#### Lead Capture Table
If you enable the lead capture form in Widget Studio, every visitor who provides their name or email is recorded in a **Leads Table**. This turns your chatbot into a passive lead generation tool — visitors get help from the AI, and you collect their contact information automatically.

---

### 🔑 API Key Management

NOVA Business AI gives you full control over which AI provider keys are used for conversations.

#### How It Works
You add your own API keys (Gemini, OpenAI, Claude, Groq, etc.) through the Settings page. NOVA AI stores them securely. When a conversation is started, NOVA AI automatically picks the right key for the selected AI provider.

#### Key Features
- **Test Any Key** — Run a live connectivity test on any saved key to confirm it's valid before using it in chat
- **Set a Primary Key** — Mark one key as your preferred default for all AI operations
- **Smart Auto-Mode** — Switch to `auto` mode and NOVA AI automatically cycles through available keys if one fails, ensuring uninterrupted conversations
- **Failure Visibility** — If a key fails, you can see exactly when it failed and the reason — no guessing
- **Separate Keys per Project** — Individual AI projects can have their own dedicated keys, isolated from your global settings

---

### 🔗 Shareable Chat Links

Every project gets a unique, secure **public share link**. Share this URL with anyone — they can chat with your AI assistant through a clean, public-facing chat page without needing an account.

This makes NOVA Business AI perfect for:
- Sharing a specialized AI assistant with a client or teammate
- Creating a public-facing support bot accessible via a direct link
- Embedding a conversation demo into a pitch deck or portfolio

---

### 🔌 Connected Services

A personal quick-launch dashboard where you save links to all your external platforms in one organized place. Instead of hunting for bookmarks, you open Connected Services and click **Open** on whichever platform you need.

**Supported out of the box:**

<table>
<tr>
<td>🐙 GitHub</td>
<td>💼 LinkedIn</td>
<td>☁️ Render</td>
</tr>
<tr>
<td>🟢 Supabase</td>
<td>📊 Microsoft Clarity</td>
<td>📈 Google Analytics</td>
</tr>
<tr>
<td>🔍 Google Search Console</td>
<td>▶️ YouTube</td>
<td>🌐 Any Custom URL</td>
</tr>
</table>

Each service card shows a live **Connected** status indicator, supports expandable descriptions, and has quick-action buttons to open or copy the URL instantly.

---

### 💬 Chat Interface — Designed for Focus

The main chat interface is clean, fast, and packed with thoughtful features.

#### ⌨️ Global Command Menu
Press **`Ctrl + K`** (or `Cmd + K` on Mac) from anywhere in the app to open a spotlight-style command menu. Search across all your past conversations by name and jump to any of them instantly.

#### 📋 Searchable Conversation History
Your left sidebar shows all past conversations, each with an **AI-generated title** based on what was discussed. Search the sidebar in real time to find any past chat without scrolling.

#### 📎 File Attachments in Chat
Attach a file directly inside a chat message. The AI reads the file content on the spot and uses it to answer your follow-up questions — no need to add it to the knowledge base first.

#### 🎤 Voice Input
Click the microphone button in the chat input and speak your message. NOVA AI transcribes your speech into text and sends it as your message. Hands-free chatting, no typing required.

#### 🔊 Read Aloud
Every AI response has a **Read Aloud** button. Click it and NOVA AI reads the message out loud using your device's text-to-speech engine. Click again to stop at any time.

#### 📋 One-Click Copy
Copy any message in the conversation — yours or the AI's — to your clipboard with a single click.

#### 💾 Save AI Responses to Knowledge Base
See something useful in a response? Select one or more AI messages and save them directly to your project's knowledge base. This lets the AI learn from its own good answers over time.

#### 🖥️ Artifact Viewer
When the AI produces structured content like code, diagrams, or rich formatted output, it opens in a dedicated **Artifact Viewer** panel beside the chat — keeping the conversation clean while giving complex content the space it deserves.

---

### 🎨 Themes

NOVA Business AI ships with multiple visual themes selectable from Settings:

| Theme | Description |
|:---|:---|
| 🌑 **Dark** | Deep dark background — easy on the eyes during long sessions |
| ☀️ **Light** | Clean white — great for bright environments |
| 🌲 **Evergreen** | A warm green-tinted dark theme |
| 💻 **System** | Automatically matches your OS appearance setting |

---

### 🔐 Authentication

Sign in with a single click using your **Google account**. No passwords, no email verification — just click "Continue with Google" and you're in. Your session is securely maintained across browser sessions.

---

## 🛠️ Technology Stack

### 🎨 Frontend

| Technology | Purpose |
|:---|:---|
| **React 18** | Core UI framework |
| **Vite** | Lightning-fast build tool and dev server |
| **TypeScript** | Full type safety across the codebase |
| **Tailwind CSS** | Utility-first, responsive styling |
| **Radix UI** | Accessible, composable UI primitives |
| **Framer Motion** | Smooth animations and micro-interactions |
| **React Query** | Smart server state caching and synchronization |
| **Wouter** | Lightweight client-side routing |
| **React Markdown + Highlight.js** | Rich markdown and code syntax rendering |
| **Sandpack (CodeSandbox)** | In-browser live code execution environment |
| **Recharts** | Analytics data visualization |

### ⚙️ Backend

| Technology | Purpose |
|:---|:---|
| **Node.js + Express 5** | HTTP server and API framework |
| **TypeScript** | Full type safety on the server |
| **Google Gemini AI** | Primary AI engine for chat and embeddings |
| **Universal LLM Adapter** | Connects OpenAI, Claude, Groq, DeepSeek, OpenRouter |
| **Puppeteer** | Headless browser for intelligent web scraping |
| **PDF-parse, Mammoth, Officeparser** | Document text extraction |
| **youtube-transcript** | YouTube video transcript retrieval |
| **Multer** | Secure multipart file upload handling |
| **Drizzle ORM** | Type-safe database queries |
| **Pino** | High-performance structured logging |

### 🗄️ Infrastructure

| Technology | Purpose |
|:---|:---|
| **Supabase (PostgreSQL)** | Scalable relational database + authentication |
| **pgvector** | Vector similarity search for AI knowledge retrieval |
| **Vercel** | Frontend hosting and CDN |
| **Render** | Backend API hosting |
| **pnpm Workspaces** | Monorepo dependency management |

---

## ⚡ Quick Start

### Prerequisites

| Tool | Version |
|:---|:---|
| Node.js | v18 or higher |
| pnpm | v10 or higher |
| Supabase account | [supabase.com](https://supabase.com) |
| Gemini API Key | [aistudio.google.com](https://aistudio.google.com) |

### 1 — Clone & Install

```bash
git clone https://github.com/MRakesh8/Chat-Bot.git
cd Chat-Bot
pnpm install
```

### 2 — Set Up Environment

```bash
cp .env.example .env
# Open .env and fill in your Supabase and Gemini credentials
```

### 3 — Start the App

```bash
pnpm run dev
```

Open `http://localhost:5173` in your browser — sign in with Google and start chatting.

---

## 🚢 Deploying to Production

NOVA Business AI is pre-configured for a **Vercel + Render** deployment.

- **Frontend** → Push to Vercel. Set `frontend/chat-app/dist` as the output directory.
- **Backend** → Connect your GitHub repo to Render. The included `render.yaml` handles the full build and start configuration automatically.

---

<br />

<div align="center">

**(https://github.com/MRakesh8)**

*If this project was helpful, please give it a ⭐ — it means a lot!*

</div>
