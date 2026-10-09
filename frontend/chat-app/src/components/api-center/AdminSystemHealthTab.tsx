import { useState } from "react";
import { 
  ShieldAlert, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Zap, 
  Clock, 
  BarChart3, 
  RotateCcw,
  Sparkles,
  Lock,
  Cpu,
  Layers
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface SystemKeyReport {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  status: string;
  isEnabled: boolean;
  isPrimary: boolean;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemainingMinutes: number;
  metrics: {
    totalRequests: number;
    totalFailures: number;
    totalSuccesses: number;
    successRatePercent: number;
    failureRatePercent: number;
    dailyLimit: number | null;
    dailyUsed: number;
    remainingDailyQuota: number | null;
    lastResetAt: string;
  };
}

export interface AdminReportData {
  success: boolean;
  generatedAt: string;
  summary: {
    totalSystemKeys: number;
    healthyKeys: number;
    quotaExceededKeys: number;
    invalidKeys: number;
    unhealthyKeys: number;
    aggregateRequests: number;
    aggregateFailures: number;
    aggregateDailyUsed: number;
    overallSuccessRatePercent: number;
  };
  keys: SystemKeyReport[];
}

interface AdminSystemHealthTabProps {
  reportData: AdminReportData | null;
  loading: boolean;
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
  onResetSystemKeys: () => Promise<void>;
}

export function AdminSystemHealthTab({
  reportData,
  loading,
  isAdmin,
  onRefresh,
  onResetSystemKeys,
}: AdminSystemHealthTabProps) {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  if (!isAdmin) {
    return (
      <div className="p-8 rounded-2xl bg-card border border-border text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-base font-semibold text-foreground">Administrator Access Required</h3>
        <p className="text-xs text-muted-foreground max-w-md mx-auto">
          System-level provider pools and platform quota metrics are restricted to platform administrators with verified RBAC roles.
        </p>
      </div>
    );
  }

  const handleReset = async () => {
    setIsResetting(true);
    try {
      await onResetSystemKeys();
      setIsResetConfirmOpen(false);
    } finally {
      setIsResetting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === "HEALTHY") {
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Healthy
        </Badge>
      );
    }
    if (status === "QUOTA_EXCEEDED" || status === "COOLDOWN") {
      return (
        <Badge variant="outline" className="text-[10px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 flex items-center gap-1">
          <Clock className="w-3 h-3 animate-spin" /> {status}
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[10px] font-mono bg-red-500/10 text-red-500 border-red-500/30 flex items-center gap-1">
        <AlertTriangle className="w-3 h-3" /> {status}
      </Badge>
    );
  };

  const summary = reportData?.summary;
  const keys = reportData?.keys || [];

  return (
    <div className="space-y-6">
      {/* Header with Refresh & Reset */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-primary" /> System Provider Health (Admin Only)
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time telemetry and quota health for backend platform provider slots.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={onRefresh}
            className="text-xs h-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsResetConfirmOpen(true)}
            className="text-xs h-8 font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset System Keys
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Total Slots</span>
            <div className="text-2xl font-bold text-foreground">{summary.totalSystemKeys}</div>
            <span className="text-[10px] text-emerald-500">{summary.healthyKeys} healthy slots</span>
          </Card>

          <Card className="bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Platform Success Rate</span>
            <div className="text-2xl font-bold text-foreground">{summary.overallSuccessRatePercent}%</div>
            <span className="text-[10px] text-muted-foreground">{summary.aggregateFailures} total fails</span>
          </Card>

          <Card className="bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Daily Requests</span>
            <div className="text-2xl font-bold text-foreground">{summary.aggregateDailyUsed}</div>
            <span className="text-[10px] text-muted-foreground">across all system slots</span>
          </Card>

          <Card className="bg-card border-border p-4 space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Degraded Slots</span>
            <div className="text-2xl font-bold text-foreground">
              {summary.quotaExceededKeys + summary.invalidKeys + summary.unhealthyKeys}
            </div>
            <span className="text-[10px] text-amber-500">
              {summary.quotaExceededKeys} in quota cooldown
            </span>
          </Card>
        </div>
      )}

      {/* System Slots Grid */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-primary" /> Active System Slots & Quotas
        </h4>

        {keys.length === 0 ? (
          <div className="p-8 rounded-2xl bg-card border border-border text-center text-xs text-muted-foreground">
            No system slots currently provisioned in database.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {keys.map((slot) => {
              const dailyLimit = slot.metrics.dailyLimit || 1500;
              const dailyUsed = slot.metrics.dailyUsed || 0;
              const usagePercent = Math.min(100, Math.round((dailyUsed / dailyLimit) * 100));

              return (
                <Card key={slot.id} className="bg-card border-border p-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Cpu className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          {slot.name || `System ${slot.provider.toUpperCase()}`}
                          {slot.isPrimary && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 bg-primary/10 text-primary border-0">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground">{slot.maskedKey}</span>
                      </div>
                    </div>

                    {getStatusBadge(slot.status)}
                  </div>

                  {/* Daily Quota Progress */}
                  <div className="space-y-1.5 pt-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Daily Quota Usage</span>
                      <span><strong>{dailyUsed}</strong> / {dailyLimit} reqs ({usagePercent}%)</span>
                    </div>
                    <Progress value={usagePercent} className="h-1.5 bg-secondary" />
                  </div>

                  {/* Slot Metrics */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[11px] text-muted-foreground">
                    <div>
                      <span>Success Rate</span>
                      <div className="font-semibold text-foreground mt-0.5">{slot.metrics.successRatePercent}%</div>
                    </div>
                    <div>
                      <span>Total Calls</span>
                      <div className="font-semibold text-foreground mt-0.5">{slot.metrics.totalRequests}</div>
                    </div>
                    <div>
                      <span>Cooldown</span>
                      <div className="font-semibold text-foreground mt-0.5">
                        {slot.cooldownRemainingMinutes > 0 ? `${slot.cooldownRemainingMinutes}m` : "None"}
                      </div>
                    </div>
                  </div>

                  {slot.failureReason && (
                    <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] text-red-500 font-mono break-all">
                      {slot.failureReason}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      <AlertDialog open={isResetConfirmOpen} onOpenChange={setIsResetConfirmOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base font-semibold">Reset System Provider Keys?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This will reset all system slot statuses to <strong className="text-emerald-500">HEALTHY</strong>, clear active cooldown timers, and reset daily request counters to zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isResetting}
              onClick={handleReset}
              className="bg-red-500 hover:bg-red-600 text-white text-xs font-semibold"
            >
              {isResetting ? "Resetting..." : "Confirm System Reset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
