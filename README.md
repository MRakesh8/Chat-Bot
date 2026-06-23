<div align="center">
  <a href="#">
    <img src="https://via.placeholder.com/1000x250/0f172a/ffffff?text=AI+Chatbot+Platform" alt="Project Banner" width="100%" />
  </a>

  <br />
  <br />

  <h1 align="center">
    <strong>Elevated AI Chatbot Experience</strong>
  </h1>

  <p align="center">
    A robust, full-stack conversational intelligence platform powered by Google Gemini and Supabase. Engineered for speed, designed for elegance, and built for maximum extensibility.
  </p>

  <p align="center">
    <a href="#-core-features"><strong>Explore Features</strong></a> ·
    <a href="#-architecture--tech-stack"><strong>View Tech Stack</strong></a> ·
    <a href="#-quick-start"><strong>Quick Start</strong></a>
  </p>

  <br />

  <!-- Badges -->
  <p align="center">
    <img src="https://img.shields.io/badge/Version-1.0.0-0f172a?style=flat-square&logo=github" alt="Version" />
    <img src="https://img.shields.io/badge/Build-Passing-22c55e?style=flat-square&logo=vercel" alt="Build" />
    <img src="https://img.shields.io/badge/Powered_by-Gemini_AI-4f46e5?style=flat-square&logo=google" alt="AI Engine" />
    <img src="https://img.shields.io/badge/Database-Supabase-3ecf8e?style=flat-square&logo=supabase" alt="Database" />
    <img src="https://img.shields.io/badge/License-MIT-0f172a?style=flat-square" alt="License" />
  </p>
</div>

<hr />

## 🌟 Overview

Welcome to the **Next-Gen AI Chatbot Platform**. This repository hosts a premium, production-ready conversational application that bridges the gap between deep AI intelligence and seamless user interaction. 

It is designed to be more than just a chatbot—it's a comprehensive workspace capable of parsing complex documents, scraping real-time web data, executing code dynamically, and maintaining context with ultra-low latency.

<br />

## ✨ Core Features

| Feature | Description |
| :--- | :--- |
| 🧠 **Cognitive Intelligence** | Powered by **Google Gemini AI** for nuanced, context-aware reasoning and natural language processing. |
| 📄 **Universal Document Parsing** | Effortlessly ingest and analyze knowledge from PDFs, Word Documents (`.docx`), and standard Office files. |
| 🌐 **Web & Media Scraping** | Integrated with **Puppeteer** to extract insights from web pages, Instagram, and YouTube video transcripts. |
| 💻 **Live Code Playground** | Embedded **Sandpack** environment allows users to write, execute, and preview code safely directly inside the chat. |
| 🎨 **Premium UI/UX** | A buttery-smooth, responsive interface built with **Tailwind CSS**, **Radix UI**, and **Framer Motion** for glassmorphic aesthetics. |
| ⚡ **Real-Time Synchronization** | Built on **Supabase** for robust authentication, instantaneous state synchronization, and secure data persistence. |

<br />

## 🏗 Architecture & Tech Stack

This project utilizes a scalable **Monorepo Architecture** managed via `pnpm workspaces`, ensuring optimal code sharing and streamlined dependency management between the client and server.

### 🎨 Frontend Engineering
The user interface prioritizes a frictionless experience with high-performance rendering.

* **Core Framework**: React.js, Vite
* **Styling & Animation**: Tailwind CSS, Radix UI Primitives, Framer Motion
* **State Management**: React Query, Wouter (Routing), React Hook Form
* **Rich Text & Code**: React Markdown, Highlight.js, Sandpack

### ⚙️ Backend Architecture
A high-throughput server built to handle intensive AI orchestration and data processing.

* **Runtime & Framework**: Node.js, Express 5.2
* **AI Orchestration**: `@google/genai`
* **Data Layer**: Supabase (PostgreSQL), Drizzle ORM
* **Processing Engines**: Puppeteer (Scraping), Multer (Multipart), PDF-parse & Mammoth (Parsing)

<br />

## 🚀 Quick Start

Get the platform running on your local machine in under 5 minutes.

### Prerequisites

Ensure your development environment meets the following requirements:
- **Node.js** (v18.x or higher)
- **pnpm** (v10.x or higher)
- Active credentials for **Supabase** and **Google Gemini AI**.

### Installation Guide

**1. Clone the repository**
```bash
git clone <repository-url>
cd Chat-bot
```

**2. Install Monorepo Dependencies**
```bash
pnpm install
```

**3. Configure Environment Variables**
Duplicate the sample environment file and securely insert your API keys.
```bash
cp .env.example .env
```

**4. Initialize the Application**
Launch both the frontend client and the backend API server concurrently.
```bash
pnpm run dev
```

> **Note**: The frontend client will be available at `http://localhost:5173`, seamlessly proxying requests to the backend API.

<br />

## 📁 Repository Structure

```text
Chat-bot/
├── backend/               # Core Express API, AI logic, and data ingestion services
├── frontend/              # Vite/React client, UI components, and API integration
├── database/              # Drizzle ORM schemas and Supabase migration files
├── shared/                # Cross-boundary TypeScript types and utility functions
├── .env.example           # Environment configuration template
└── pnpm-workspace.yaml    # Monorepo workspace definitions
```

<br />

<hr />

<div align="center">
  <p>Engineered for performance. Designed for humans.</p>
  <p><strong>Released under the MIT License</strong></p>
</div>
