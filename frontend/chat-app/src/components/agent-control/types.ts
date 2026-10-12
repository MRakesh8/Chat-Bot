export type RiskLevel = "READ_ONLY" | "LOW_RISK_WRITE" | "HIGH_RISK_WRITE" | "IRREVERSIBLE";

export type ToolStatus = "DISCOVERED" | "VERIFIED" | "AUTHORIZED" | "EXECUTABLE" | "UNAVAILABLE";

export type VerificationStatus = "SUCCEEDED" | "FAILED" | "UNVERIFIED" | "PARTIALLY_COMPLETED";

export interface StepVerification {
  verified: boolean;
  status: VerificationStatus;
  evidence?: Record<string, any>;
  reason?: string;
}

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
  stepId?: string;
  actionType?: string;
  description?: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "PENDING_APPROVAL" | "SKIPPED" | string;
  detail?: string;
  timestamp?: string;
  durationMs?: number;
  dependsOn?: string[];
  inputMapping?: Record<string, string>;
  riskLevel?: RiskLevel;
  requiresConfirmation?: boolean;
  input?: Record<string, any>;
  result?: any;
  error?: string;
  verification?: StepVerification;
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
 * Cryptographic action confirmation for internal server tool execution.
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
  actionType?: string;
  stepDescription?: string;
  riskLevel?: RiskLevel;
  parameters?: Record<string, any>;
  confirmationToken?: string;
  expiresAt?: string;
  response?: string;
}

export type StreamConnectionState = "connected" | "reconnecting" | "polling" | "disconnected";
