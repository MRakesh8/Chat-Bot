export const DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
export const DEMO_SHARE_TOKEN = "demo_share_token_apex_dynamics";

export function isDemoProjectId(projectId?: string | null): boolean {
  if (!projectId) return false;
  return projectId === "demo" || projectId === "demo-project" || projectId === DEMO_PROJECT_ID;
}

export function isDemoShareToken(token?: string | null): boolean {
  if (!token) return false;
  return token === "demo" || token === DEMO_SHARE_TOKEN;
}

export function getDemoProjectMeta() {
  return {
    id: DEMO_PROJECT_ID,
    name: "Apex Dynamics — Demo",
    description: "Fictional business consulting agency demo project. Explore NOVA Business AI features safely.",
    systemPrompt: `You are the AI Business Assistant for Apex Dynamics Consulting, a high-end corporate consulting firm specializing in Business Strategy, Digital Transformation, Technology Consulting, and Operations Optimization. You provide polite, accurate, and professional assistance based on Apex Dynamics services.`,
    userId: "00000000-0000-4000-8000-000000000001",
    organizationId: "5e6c4459-93c8-40a0-9fb2-9e9927b77ba9",
    shareToken: DEMO_SHARE_TOKEN,
    isActive: true,
    isDemo: true,
    tags: ["consulting", "enterprise", "strategy", "demo"],
    websiteUrl: "https://apex-dynamics-demo.example.com",
    businessType: "B2B Consulting & Professional Services",
    businessTypeConfidence: 98,
    platform: "Next.js & Shopify",
    platformConfidence: 95,
    discoveryStatus: "COMPLETED",
    intelligence: {
      businessName: "Apex Dynamics Consulting",
      industry: "Management & Technology Consulting",
      headquarters: "San Francisco, CA & London, UK",
      targetAudience: "Enterprise executives, CTOs, and high-growth leadership teams",
      services: [
        "Strategic Business Planning & Execution",
        "Enterprise Digital Transformation",
        "AI Architecture & Cloud Integration",
        "Operational Scaling & Process Automation"
      ],
      capabilities: {
        shopify: { status: "CONNECTED", provider: "shopify", environment: "sandbox" },
        crm: { status: "AVAILABLE", provider: "hubspot" },
        booking: { status: "AVAILABLE", provider: "calendly" }
      }
    },
    entitlement: {
      allowed: true,
      status: "TRIAL_ACTIVE" as const,
      expiresAt: "2099-12-31T23:59:59.000Z",
      message: "Demo Mode — Safe sandbox environment"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}

export function getDemoKnowledgeSources() {
  return [
    {
      id: "demo-source-homepage",
      projectId: DEMO_PROJECT_ID,
      title: "Homepage — Overview & Value Proposition",
      url: "https://apex-dynamics-demo.example.com/",
      sourceType: "website",
      status: "COMPLETED",
      chunkCount: 4,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "demo-source-about",
      projectId: DEMO_PROJECT_ID,
      title: "About Us — Leadership & Mission",
      url: "https://apex-dynamics-demo.example.com/about",
      sourceType: "website",
      status: "COMPLETED",
      chunkCount: 3,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "demo-source-services",
      projectId: DEMO_PROJECT_ID,
      title: "Services — Strategic & Tech Consulting",
      url: "https://apex-dynamics-demo.example.com/services",
      sourceType: "website",
      status: "COMPLETED",
      chunkCount: 6,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "demo-source-faq",
      projectId: DEMO_PROJECT_ID,
      title: "FAQ — Client Engagement & Pricing Models",
      url: "https://apex-dynamics-demo.example.com/faq",
      sourceType: "website",
      status: "COMPLETED",
      chunkCount: 5,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "demo-source-contact",
      projectId: DEMO_PROJECT_ID,
      title: "Contact & Consultation Booking",
      url: "https://apex-dynamics-demo.example.com/contact",
      sourceType: "website",
      status: "COMPLETED",
      chunkCount: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ];
}

export function getDemoKnowledgeChunks() {
  return [
    {
      id: "demo-chunk-1",
      sourceId: "demo-source-homepage",
      content: `Apex Dynamics Consulting is a premier global advisory firm. We empower Fortune 500 enterprises and hyper-growth scale-ups to navigate complex market disruptions, modernize technology stacks, and execute high-impact strategic initiatives.`,
      category: "Overview",
      tag: "Company Overview"
    },
    {
      id: "demo-chunk-2",
      sourceId: "demo-source-services",
      content: `Our Core Consulting Practices:
1. Business Strategy & Advisory: Corporate portfolio restructuring, M&A integration, revenue growth strategies.
2. Digital Transformation: Cloud architecture modernization, legacy system migrations, agile enterprise adoption.
3. Enterprise AI & Automation: Implementing intelligent workflows, private LLM deployments, and predictive analytics.
4. Operational Excellence: Supply chain optimization, process re-engineering, and organizational cost efficiency.`,
      category: "Services",
      tag: "Practice Areas"
    },
    {
      id: "demo-chunk-3",
      sourceId: "demo-source-faq",
      content: `Engagement Models & Timelines:
- Diagnostic Sprints: 2-3 week deep-dive assessments with actionable roadmaps.
- Implementation Programs: 3-9 month end-to-end transformation execution.
- Executive Retainers: Ongoing strategic advisory and board-level consulting.`,
      category: "FAQ",
      tag: "Engagement Models"
    },
    {
      id: "demo-chunk-4",
      sourceId: "demo-source-contact",
      content: `Contact Information:
- Email: advisory@apex-dynamics-consulting.com
- Main Office: 500 Howard Street, Suite 400, San Francisco, CA 94105
- EMEA Office: 25 Bank Street, Canary Wharf, London E14 5JP
- Consultations can be scheduled directly through our client portal.`,
      category: "Contact",
      tag: "Offices"
    }
  ];
}

export function getDemoDashboardData() {
  return {
    overview: {
      totalCustomers: 128,
      totalConversations: 342,
      aiResponses: 856,
      toolExecutions: 0,
    },
    customers: {
      total: 128,
      active: 42
    },
    conversations: {
      total: 342,
      active: 4
    },
    aiActivity: {
      responses: 856,
    },
    toolActivity: {
      totalExecutions: 0,
      successfulExecutions: 0
    },
    integrations: [
      { provider: "shopify", status: "AUTHORIZED", environment: "sandbox" },
      { provider: "gemini", status: "AUTHORIZED", environment: "production" }
    ],
    website: {
      status: "COMPLETED",
      url: "https://apex-dynamics-demo.example.com",
      platform: "Next.js & Shopify",
      businessType: "B2B Consulting & Professional Services",
      intelligence: {
        businessName: "Apex Dynamics Consulting",
        services: ["Strategy", "Digital Transformation", "AI Architecture", "Operations"]
      }
    },
    whatsapp: {
      status: "Demo Sandbox Ready"
    },
    usage: {
      plan: "Demo Mode (Unlimited Sandbox)",
      currentUsage: 856,
      quota: 10000,
      resetAt: "2099-12-31T23:59:59.000Z"
    },
    errors: []
  };
}

export function getDemoIntegrations() {
  return [
    {
      id: "demo-integ-shopify",
      projectId: DEMO_PROJECT_ID,
      provider: "shopify",
      status: "AUTHORIZED",
      config: {
        shopDomain: "apex-dynamics-demo.myshopify.com",
        environment: "sandbox",
        isDemo: true
      },
      hasCredentials: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "demo-integ-gemini",
      projectId: DEMO_PROJECT_ID,
      provider: "gemini",
      status: "AUTHORIZED",
      config: {
        model: "gemini-2.5-flash",
        isDemo: true
      },
      hasCredentials: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ];
}

export function getDemoNotifications() {
  return {
    notifications: [
      {
        id: "demo-notif-1",
        projectId: DEMO_PROJECT_ID,
        title: "AI Business Assistant Active",
        message: "Apex AI Assistant is operating normally in sandbox demo mode with 5 indexed knowledge sources.",
        type: "system",
        readAt: null,
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString()
      },
      {
        id: "demo-notif-2",
        projectId: DEMO_PROJECT_ID,
        title: "Demo Conversation Inquired on AI Transformation",
        message: "Visitor inquired about enterprise AI architecture and consulting sprints.",
        type: "chat",
        readAt: null,
        createdAt: new Date(Date.now() - 1000 * 60 * 120).toISOString()
      },
      {
        id: "demo-notif-3",
        projectId: DEMO_PROJECT_ID,
        title: "Shopify Sandbox Verified",
        message: "Demo Shopify integration is connected in read-only sandbox mode.",
        type: "integration",
        readAt: new Date(Date.now() - 1000 * 60 * 360).toISOString(),
        createdAt: new Date(Date.now() - 1000 * 60 * 400).toISOString()
      }
    ],
    settings: {
      notifyOnDislikes: 3,
      notifyOnLikes: 3,
      enabled: true
    }
  };
}

export function getDemoAnalytics() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    summary: {
      totalVisitors: 1240,
      totalConversations: 342,
      satisfactionRate: 98.4,
      avgResponseTimeMs: 420
    },
    timeSeries: days.map((day, idx) => ({
      day,
      visitors: 140 + idx * 25,
      conversations: 35 + idx * 8,
      satisfaction: 97 + (idx % 3)
    }))
  };
}

export function getDemoFeedback() {
  return {
    averageRating: 4.9,
    totalReviews: 86,
    breakdown: { 5: 78, 4: 6, 3: 2, 2: 0, 1: 0 },
    recentReviews: [
      {
        id: "demo-fb-1",
        rating: 5,
        comment: "The AI gave an immediate, crisp summary of the consulting engagement options.",
        createdAt: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      },
      {
        id: "demo-fb-2",
        rating: 5,
        comment: "Extremely helpful in understanding Apex Dynamics' AI integration capabilities.",
        createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString()
      }
    ]
  };
}

export function getDemoWidgetSettings() {
  return {
    projectId: DEMO_PROJECT_ID,
    botName: "Apex AI Assistant",
    botAvatar: null,
    welcomeMessage: "Hello 👋 Welcome to Apex Dynamics Consulting. Ask us anything about our corporate strategy and digital transformation services.",
    themeColor: "#2563eb",
    position: "bottom-right",
    displayMode: "floating",
    launcherTitle: "Chat with Apex AI",
    welcomeHeading: "Apex Dynamics Consulting",
    welcomeSubtitle: "Ask us anything about our corporate strategy and digital transformation services.",
    placeholderText: "Ask a question about our services...",
    inputPlaceholder: "Ask a question about our services...",
    onlineStatus: "Online",
    allowedDomains: ["apex-dynamics-demo.example.com", "localhost"],
    isEnabled: true,
    widgetToken: "tok_demo_apex_dynamics",
    appearance: {
      themeMode: "all",
      widgetBg: "#18181b",
      headerBg: "#2563eb",
      headerText: "#ffffff",
      aiMsgBg: "#18181b",
      aiMsgText: "#f4f4f5",
      userMsgBg: "#2563eb",
      userMsgText: "#ffffff",
      inputBg: "#09090b",
      inputText: "#f4f4f5",
      placeholderText: "#a1a1aa",
      sendBtnBg: "#2563eb",
      sendBtnIcon: "#ffffff",
      launcherBg: "#2563eb",
      launcherIcon: "#ffffff",
      borderColor: "#27272a",
      statusColor: "#10b981"
    }
  };
}

export function getDemoContextSettings() {
  return {
    projectId: DEMO_PROJECT_ID,
    ragEnabled: true,
    intentDetectionEnabled: true,
    leadCaptureEnabled: true,
    humanHandoffEnabled: true,
    strictSafetyEnabled: true
  };
}

export function getDemoVisitorConversations() {
  return [
    {
      id: "demo-session-vis-1",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      modeId: null,
      title: "Enterprise Digital Transformation Inquiry",
      isFavorite: false,
      expiresAt: null,
      messageCount: 5,
      lastMessage: "The Diagnostic & Architecture phase typically spans 3 weeks with a fixed-fee milestone model.",
      lastMessageRole: "assistant",
      createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
    },
    {
      id: "demo-session-vis-2",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      modeId: null,
      title: "Shopify & SAP ERP Inventory Sync",
      isFavorite: false,
      expiresAt: null,
      messageCount: 4,
      lastMessage: "Yes, Apex Dynamics specializes in custom middleware pipelines connecting Shopify Plus with ERP systems.",
      lastMessageRole: "assistant",
      createdAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 72).toISOString(),
    },
    {
      id: "demo-session-vis-3",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      modeId: null,
      title: "AI Compliance & Data Governance Consultation",
      isFavorite: false,
      expiresAt: null,
      messageCount: 2,
      lastMessage: "Apex Dynamics enforces strict enterprise governance: zero-data-retention agreements and multi-tenant RLS.",
      lastMessageRole: "assistant",
      createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      updatedAt: new Date(Date.now() - 1000 * 60 * 238).toISOString(),
    },
  ];
}

export function getDemoVisitorConversationDetail(convId: string) {
  const allDetails: Record<string, any> = {
    "demo-session-vis-1": {
      id: "demo-session-vis-1",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      title: "Enterprise Digital Transformation Inquiry",
      createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
      messages: [
        {
          id: "demo-msg-101",
          conversationId: "demo-session-vis-1",
          role: "user",
          content: "Hi! We're a 500-person logistics firm looking to modernize our legacy ERP and integrate AI workflows. What engagement options do you offer?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
        {
          id: "demo-msg-102",
          conversationId: "demo-session-vis-1",
          role: "assistant",
          content: "Hello! Apex Dynamics offers structured Enterprise Digital Transformation sprints. We typically begin with a 2-4 week Diagnostic & Architecture phase to evaluate legacy constraints and map AI high-leverage opportunities. Would you like an overview of our sprint deliverables or to schedule a partner consultation?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 17).toISOString(),
          sourceTransparency: "project",
          confidence: "high",
        },
        {
          id: "demo-msg-103",
          conversationId: "demo-session-vis-1",
          role: "user",
          content: "What is the typical timeline and cost model for the diagnostic phase?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 16).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
        {
          id: "demo-msg-104",
          conversationId: "demo-session-vis-1",
          role: "assistant",
          content: "The Diagnostic & Architecture phase typically spans 3 weeks with a fixed-fee milestone model. Deliverables include a Cloud & AI readiness scorecard, target-state architecture, and an executive roadmap.",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
          sourceTransparency: "project",
          confidence: "high",
        },
        {
          id: "demo-msg-105",
          conversationId: "demo-session-vis-1",
          role: "user",
          content: "Great, I will review this with our CTO. Thank you!",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 14).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
      ],
    },
    "demo-session-vis-2": {
      id: "demo-session-vis-2",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      title: "Shopify & SAP ERP Inventory Sync",
      createdAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
      messages: [
        {
          id: "demo-msg-201",
          conversationId: "demo-session-vis-2",
          role: "user",
          content: "Do you support real-time inventory synchronization between Shopify Plus and SAP ERP?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 85).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
        {
          id: "demo-msg-202",
          conversationId: "demo-session-vis-2",
          role: "assistant",
          content: "Yes, Apex Dynamics specializes in custom middleware pipelines connecting Shopify Plus with ERP systems including SAP, NetSuite, and Microsoft Dynamics. We implement bi-directional webhooks and queue-backed synchronization to ensure sub-second consistency and prevent overselling.",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 83).toISOString(),
          sourceTransparency: "project",
          confidence: "high",
        },
        {
          id: "demo-msg-203",
          conversationId: "demo-session-vis-2",
          role: "user",
          content: "Can you provide references or case study metrics?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 75).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
        {
          id: "demo-msg-204",
          conversationId: "demo-session-vis-2",
          role: "assistant",
          content: "In our engagement with Global Retail Partners, we reduced inventory sync latency from 15 minutes to under 800ms while maintaining zero inventory drift across 12,000 orders/hour during peak holiday promotions.",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 72).toISOString(),
          sourceTransparency: "project",
          confidence: "high",
        },
      ],
    },
    "demo-session-vis-3": {
      id: "demo-session-vis-3",
      userId: null,
      customerId: null,
      projectId: DEMO_PROJECT_ID,
      title: "AI Compliance & Data Governance Consultation",
      createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
      messages: [
        {
          id: "demo-msg-301",
          conversationId: "demo-session-vis-3",
          role: "user",
          content: "How does Apex ensure customer data privacy when using generative AI models?",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
          sourceTransparency: null,
          confidence: null,
        },
        {
          id: "demo-msg-302",
          conversationId: "demo-session-vis-3",
          role: "assistant",
          content: "Apex Dynamics enforces strict enterprise governance: zero-data-retention agreements with LLM providers, multi-tenant row-level isolation (RLS), encrypted credential storage, and boundary-checked prompt sanitization to eliminate prompt injection risks.",
          fileIds: null,
          createdAt: new Date(Date.now() - 1000 * 60 * 238).toISOString(),
          sourceTransparency: "combined",
          confidence: "high",
        },
      ],
    },
  };

  return allDetails[convId] || allDetails["demo-session-vis-1"];
}
