export const DEMO_PROJECT_ID = "00000000-0000-4000-8000-000000000000";
export const DEMO_SHARE_TOKEN = "demo_share_token_apex_dynamics";

export function isDemoProjectId(projectId?: string | null): boolean {
  if (!projectId) return false;
  return projectId === "demo" || projectId === DEMO_PROJECT_ID;
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
    widgetToken: "tok_demo_apex_dynamics",
    isEnabled: true,
    themeColor: "#2563eb",
    position: "bottom-right",
    launcherTitle: "Chat with Apex AI",
    welcomeHeading: "Apex Dynamics Consulting",
    welcomeSubtitle: "Ask us anything about our corporate strategy and digital transformation services.",
    placeholderText: "Ask a question about our services...",
    allowedDomains: ["apex-dynamics-demo.example.com", "localhost"]
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
