export type RiskLevel = "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";

export type ToolStatus = "DISCOVERED" | "VERIFIED" | "AUTHORIZED" | "EXECUTABLE" | "UNAVAILABLE";

export interface AgentCapability {
  capabilityId: string;
  name: string;
  providerId: string;
  status: ToolStatus;
  riskLevel: RiskLevel;
  description?: string;
  parameters?: Record<string, any>;
}

export type ExecutionStatus =
  | "PENDING"
  | "RUNNING"
  | "PENDING_APPROVAL"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ExecutionStep {
  name: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PENDING_APPROVAL" | string;
  detail?: string;
  timestamp?: string;
  error?: string;
}

export interface AgentExecutionRecord {
  id: string;
  projectId: string;
  organizationId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  agentType: string;
  title: string;
  status: ExecutionStatus;
  inputPayload: Record<string, any>;
  outputData: Record<string, any>;
  error?: string | null;
  steps: ExecutionStep[];
  retryCount: number;
  maxRetries: number;
  approvalToken?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionStats {
  totalCount: number;
  runningCount: number;
  pendingApprovalCount: number;
  failedCount: number;
  completedCount: number;
}

/**
 * Kept separate: Cryptographic action confirmation for internal server tool execution
 * (e.g. high-risk write actions via /api/agent/process or tools execute).
 */
export interface ConfirmationState {
  actionId: string;
  actionName: string;
  riskLevel: RiskLevel;
  confirmationToken: string;
  expiresAt?: string;
  message?: string;
  parameters?: any;
}

/**
 * Dedicated approval request state for persisted executions in PENDING_APPROVAL status.
 */
export interface ExecutionApprovalState {
  executionId: string;
  title: string;
  agentType: string;
  requiresToken: boolean;
}

export type StreamConnectionState = "connected" | "reconnecting" | "polling" | "disconnected";
