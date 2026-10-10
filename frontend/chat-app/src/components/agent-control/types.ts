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

export type ExecutionStatus = "SUCCESS" | "COMPLETED" | "FAILED" | "PENDING_CONFIRMATION" | "FORBIDDEN" | "RUNNING";

export interface AgentExecutionRun {
  id: string;
  type: "tool_execution" | "security" | "action" | string;
  title: string;
  detail: string;
  status: string;
  timestamp: string;
  projectId: string;
  metadata?: {
    durationMs?: number;
    riskLevel?: RiskLevel;
    status?: string;
    providerName?: string;
    toolId?: string;
    actionName?: string;
    userId?: string;
    error?: string;
    rawResult?: any;
    parameters?: any;
    [key: string]: any;
  };
}

export interface ConfirmationState {
  actionId: string;
  actionName: string;
  riskLevel: RiskLevel;
  confirmationToken: string;
  expiresAt?: string;
  message?: string;
  parameters?: any;
}

export type StreamConnectionState = "connected" | "reconnecting" | "polling" | "disconnected";
