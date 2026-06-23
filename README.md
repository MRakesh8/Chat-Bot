<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-brightgreen?style=for-the-badge" alt="Status" />
  <img src="https://img.shields.io/badge/PRs-Welcome-blue?style=for-the-badge" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License" />
</div>

<h1 align="center">🚀 Next-Gen AI Chatbot</h1>

<p align="center">
  <b>A powerful, full-stack, and intelligent AI Chatbot powered by Google Gemini and Supabase.</b><br>
  Built with modern web technologies for a seamless, blazing-fast, and highly interactive user experience.
</p>

---

## ✨ Features

Our chatbot is packed with advanced capabilities, ensuring an intelligent and versatile experience:

- 🧠 **Advanced AI Conversations**: Powered by Google's Gemini AI for deep, context-aware, and natural responses.
- 📄 **Multi-Format Document Parsing**: Upload and analyze diverse files seamlessly.
  - *Supported formats*: PDF, Word (`.docx`), and other Office documents.
- 🌐 **Web & Media Intelligence**:
  - Automatically fetch and analyze YouTube video transcripts.
  - Scrape and summarize external web pages and links (via Puppeteer).
- 💻 **Live Code Execution**: Features an integrated code playground (Sandpack) to write, test, and render code snippets directly within the chat!
- 🎨 **Sleek, Modern UI**: Designed with TailwindCSS, Radix UI, and Framer Motion for buttery-smooth animations and glassmorphism aesthetics.
- ⚡ **Real-Time Data**: Backed by a robust Supabase database architecture to keep your chat history perfectly synced.

---

## 🛠️ Technology Stack

This project uses a monorepo architecture (pnpm workspaces) to neatly separate the frontend and backend while sharing core utilities.

### 🎨 Frontend
> The user interface is built to be fast, responsive, and visually stunning.
- **Framework**: React.js with Vite
- **Styling**: Tailwind CSS, Radix UI, Framer Motion
- **Routing & State**: Wouter, React Query, React Hook Form
- **Markdown & Code**: React Markdown, Highlight.js, Sandpack (CodeSandbox)

### ⚙️ Backend
> A robust and scalable server handling AI operations, file parsing, and data scraping.
- **Framework**: Node.js, Express 5.2
- **AI Engine**: `@google/genai` (Google Gemini AI)
- **Database ORM**: Drizzle ORM
- **Utilities**: Puppeteer (Web Scraping), Multer (Uploads), PDF-parse & Mammoth (Doc parsing), Youtube-dl & Transcripts

### 🗄️ Database & Services
- **Backend-as-a-Service**: Supabase (PostgreSQL, Auth, Storage)

---

## 🚀 Getting Started

Follow these steps to run the project locally on your machine.

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) and [pnpm](https://pnpm.io/) installed.

### 1. Clone & Install
```bash
# Clone the repository
git clone <your-repo-url>
cd Chat-bot

# Install dependencies (using pnpm workspace)
pnpm install
```

### 2. Environment Variables
Copy the `.env.example` file to `.env` and configure your API keys (Google Gemini, Supabase, etc.).
```bash
cp .env.example .env
```

### 3. Run the Development Server
This single command will spin up both the frontend and backend servers simultaneously!
```bash
pnpm run dev
```
* **Frontend**: Usually runs on `http://localhost:5173`
* **Backend**: Connected and ready to handle API requests.

---

## 📁 Project Structure

```bash
📦 Chat-bot
 ┣ 📂 backend          # Express API server, Gemini AI integration, parsing logic
 ┣ 📂 frontend         # React/Vite UI application, components, API clients
 ┣ 📂 database         # Drizzle ORM schemas and Supabase setup
 ┣ 📂 shared           # Shared Typescript types/utilities
 ┗ 📜 pnpm-workspace.yaml
```

---

<div align="center">
  <i>Built with ❤️ using the latest in Web & AI technologies.</i>
</div>
