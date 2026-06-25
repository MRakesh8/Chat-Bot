import { useState, useEffect } from "react";
import { 
  BarChart3, 
  AlertCircle, 
  Key, 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Zap, 
  Clock, 
  ArrowUpRight, 
  ShieldAlert
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";

interface KeyMetrics {
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  successRatePercent: number;
  failureRatePercent: number;
  dailyLimit: number | null;
  dailyUsed: number;
  remainingDailyQuota: number | null;
  lastResetAt: string;
}

interface SystemKeyReport {
  id: string;
  name: string;
  provider: string;
  maskedKey: string;
  status: "HEALTHY" | "COOLDOWN" | "QUOTA_EXCEEDED" | "INVALID" | "UNHEALTHY" | "DISABLED";
  isEnabled: boolean;
  isPrimary: boolean;
  lastSuccess: string | null;
  lastFailure: string | null;
  failureReason: string | null;
  cooldownUntil: string | null;
  cooldownRemainingMinutes: number;
  metrics: KeyMetrics;
  timestamps: {
    createdAt: string;
    updatedAt: string;
  };
}

interface ReportSummary {
  totalSystemKeys: number;
  healthyKeys: number;
  quotaExceededKeys: number;
  invalidKeys: number;
  unhealthyKeys: number;
  aggregateRequests: number;
  aggregateFailures: number;
  aggregateDailyUsed: number;
  overallSuccessRatePercent: number;
}

interface ReportResponse {
  success: boolean;
  generatedAt: string;
  summary: ReportSummary;
  keys: SystemKeyReport[];
}

export default function AdminClarityPage() {
  const { user, session } = useAuth();
  const [activeTab, setActiveTab] = useState<"keys" | "clarity">("keys");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Strict client-side admin check
  const isAdmin = user?.email === "rakesh837m@gmail.com" || 
                  (import.meta.env.DEV || window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

  const fetchReport = async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const token = session?.access_token;
      const res = await fetch(apiUrl("/api/system/admin/keys-report"), {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error("Access denied: Restricted to administrators.");
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch system keys report.");
      }

      const data: ReportResponse = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err.message || "An error occurred while loading the report.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      fetchReport();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-full bg-background items-center justify-center p-8">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShieldAlert className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Access Denied</h2>
          <p className="text-muted-foreground mb-6">
            This dashboard is highly restricted and only accessible to administrators.
          </p>
          <div className="text-xs bg-muted/50 p-3 rounded-lg border border-border text-muted-foreground font-mono">
            Restricted for: rakesh837m@gmail.com
          </div>
        </div>
      </div>
    );
  }

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "HEALTHY":
        return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
      case "QUOTA_EXCEEDED":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      case "COOLDOWN":
      case "UNHEALTHY":
        return "bg-rose-500/10 text-rose-500 border-rose-500/20";
      case "INVALID":
        return "bg-red-500/10 text-red-500 border-red-500/20";
      default:
        return "bg-muted text-muted-foreground border-border";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "HEALTHY":
        return <CheckCircle2 className="w-4 h-4 mr-1" />;
      case "QUOTA_EXCEEDED":
        return <AlertTriangle className="w-4 h-4 mr-1" />;
      case "COOLDOWN":
      case "UNHEALTHY":
        return <Clock className="w-4 h-4 mr-1" />;
      case "INVALID":
        return <XCircle className="w-4 h-4 mr-1" />;
      default:
        return <AlertCircle className="w-4 h-4 mr-1" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Premium Header */}
      <div className="flex-none p-4 border-b border-border flex items-center justify-between bg-card z-10">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold text-foreground tracking-tight">Admin Console</h1>
            <span className="ml-2 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20">Super Admin</span>
          </div>
          
          {/* Navigation Tabs */}
          <div className="flex bg-muted/50 p-1 rounded-xl border border-border">
            <button
              onClick={() => setActiveTab("keys")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === "keys" 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              System Keys Health
            </button>
            <button
              onClick={() => setActiveTab("clarity")}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                activeTab === "clarity" 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Microsoft Clarity
            </button>
          </div>
        </div>
        
        {activeTab === "keys" && (
          <Button 
            variant="outline"
            size="sm"
            className="bg-background/50 hover:bg-muted font-medium flex items-center gap-2 rounded-xl px-4"
            onClick={() => fetchReport(true)}
            disabled={loading || refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing..." : "Refresh Status"}
          </Button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto w-full p-6 bg-background/50">
        {activeTab === "keys" ? (
          <div className="max-w-7xl mx-auto space-y-6">
            
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 space-y-4">
                <RefreshCw className="w-10 h-10 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm font-medium">Loading system keys health report...</p>
              </div>
            ) : error ? (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 flex items-start gap-4 text-red-500">
                <AlertCircle className="w-6 h-6 flex-none mt-0.5" />
                <div>
                  <h3 className="text-lg font-bold mb-1">Failed to load report</h3>
                  <p className="text-sm opacity-90">{error}</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4 border-red-500/30 hover:bg-red-500/10 text-red-500 rounded-xl"
                    onClick={() => fetchReport()}
                  >
                    Retry Fetch
                  </Button>
                </div>
              </div>
            ) : report ? (
              <>
                {/* Aggregate Summary Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Total Keys Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-primary/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-primary/10 rounded-xl text-primary">
                        <Key className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-emerald-500 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                        {report.summary.healthyKeys} / {report.summary.totalSystemKeys} Active
                      </span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.totalSystemKeys}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total System Keys</div>
                  </div>

                  {/* Overall Success Rate Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-emerald-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500">
                        <Activity className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Lifetime Metrics</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.overallSuccessRatePercent}%</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Overall Success Rate</div>
                  </div>

                  {/* Aggregate Requests Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-blue-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-blue-500/10 rounded-xl text-blue-400">
                        <Zap className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-rose-500 font-bold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/20">
                        {report.summary.aggregateFailures} Failures
                      </span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.aggregateRequests}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aggregate API Requests</div>
                  </div>

                  {/* Daily Active Usage Card */}
                  <div className="bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-6 -mt-6 group-hover:bg-amber-500/10 transition-all duration-500" />
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-amber-500/10 rounded-xl text-amber-500">
                        <Clock className="w-5 h-5" />
                      </div>
                      <span className="text-xs text-muted-foreground font-medium">Quota Reset: Daily</span>
                    </div>
                    <div className="text-3xl font-black tracking-tight mb-1">{report.summary.aggregateDailyUsed}</div>
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Aggregate Usage</div>
                  </div>
                </div>

                {/* Sub-Header / Info Banner */}
                <div className="flex items-center justify-between py-2 border-b border-border">
                  <h2 className="text-lg font-bold text-foreground">System Keys Performance Registry</h2>
                  <span className="text-xs text-muted-foreground">Report updated: {new Date(report.generatedAt).toLocaleTimeString()}</span>
                </div>

                {/* Keys Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {report.keys.map((key) => {
                    const progressPercent = key.metrics.dailyLimit 
                      ? Math.min(100, (key.metrics.dailyUsed / key.metrics.dailyLimit) * 100)
                      : 0;

                    return (
                      <div 
                        key={key.id}
                        className="bg-card border border-border rounded-2xl shadow-sm hover:shadow-xl hover:border-primary/25 hover:-translate-y-0.5 transition-all duration-300 flex flex-col overflow-hidden group"
                      >
                        {/* Key Top Details */}
                        <div className="p-5 border-b border-border flex items-start justify-between bg-muted/20">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-bold text-foreground tracking-tight">{key.name}</h3>
                              {key.isPrimary && (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-primary/15 text-primary rounded-full border border-primary/20 uppercase tracking-wide">
                                  Primary
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
                              <span className="uppercase font-bold text-foreground/85">{key.provider}</span>
                              <span>•</span>
                              <span>{key.maskedKey}</span>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full border text-xs font-bold flex items-center shadow-sm ${getStatusBadgeClass(key.status)}`}>
                            {getStatusIcon(key.status)}
                            {key.status.replace("_", " ")}
                          </span>
                        </div>

                        {/* Metrics Panel */}
                        <div className="p-5 flex-1 space-y-4">
                          {/* Daily Usage Progress Bar */}
                          <div>
                            <div className="flex justify-between items-center text-xs font-semibold mb-1.5">
                              <span className="text-muted-foreground">Daily Request Quota</span>
                              <span className="text-foreground">
                                {key.metrics.dailyUsed} / {key.metrics.dailyLimit !== null ? key.metrics.dailyLimit : "∞"} requests
                              </span>
                            </div>
                            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-500 ${
                                  progressPercent > 80 
                                    ? "bg-rose-500" 
                                    : progressPercent > 50 
                                    ? "bg-amber-500" 
                                    : "bg-primary"
                                }`}
                                style={{ width: `${key.metrics.dailyLimit !== null ? progressPercent : 0}%` }}
                              />
                            </div>
                          </div>

                          {/* Request Stats Grid */}
                          <div className="grid grid-cols-3 gap-2 text-center bg-muted/35 p-3 rounded-xl border border-border">
                            <div>
                              <div className="text-lg font-black tracking-tight text-foreground">{key.metrics.totalRequests}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Requests</div>
                            </div>
                            <div>
                              <div className="text-lg font-black tracking-tight text-emerald-500">{key.metrics.totalSuccesses}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Successes</div>
                            </div>
                            <div>
                              <div className="text-lg font-black tracking-tight text-rose-500">{key.metrics.totalFailures}</div>
                              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Failures</div>
                            </div>
                          </div>

                          {/* Efficiency Metrics */}
                          <div className="flex items-center justify-between text-xs border-b border-border/50 pb-2">
                            <span className="text-muted-foreground font-medium">Efficiency Rates</span>
                            <span className="font-semibold text-foreground">
                              {key.metrics.successRatePercent}% success rate / {key.metrics.failureRatePercent}% error rate
                            </span>
                          </div>

                          {/* Cooldown Info */}
                          {key.cooldownRemainingMinutes > 0 && (
                            <div className="bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl p-3 text-xs flex items-start gap-2.5">
                              <Clock className="w-4 h-4 flex-none mt-0.5" />
                              <div>
                                <span className="font-bold">Active Cooling Period:</span> The key is temporarily benched for another <span className="font-bold">{key.cooldownRemainingMinutes} minutes</span> to allow the remote Gemini API rate quotas to reset.
                              </div>
                            </div>
                          )}

                          {/* Failure Reason Box */}
                          {key.failureReason && (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 rounded-xl p-3 text-xs flex flex-col gap-1.5">
                              <div className="flex items-center gap-1.5 font-bold">
                                <AlertCircle className="w-4 h-4" />
                                Last Logged Failure Reason
                              </div>
                              <div className="font-mono bg-background/50 p-2 rounded border border-rose-500/15 break-all max-h-24 overflow-y-auto">
                                {key.failureReason}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Card Footer Timestamps */}
                        <div className="px-5 py-3 border-t border-border bg-muted/10 text-[10px] text-muted-foreground flex justify-between">
                          <span>Last Success: {key.lastSuccess ? new Date(key.lastSuccess).toLocaleTimeString() : "Never"}</span>
                          <span>Last Failure: {key.lastFailure ? new Date(key.lastFailure).toLocaleTimeString() : "Never"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          /* Microsoft Clarity Tab */
          <div className="flex-1 w-full bg-background flex flex-col items-center justify-center py-12">
            <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-xl">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-foreground tracking-tight">Microsoft Clarity</h2>
              <p className="text-muted-foreground mb-8">
                For security reasons, Microsoft Clarity dashboards cannot be embedded directly within other applications. Please open the dashboard in a secure external window to view your analytics.
              </p>
              <Button 
                size="lg" 
                className="w-full font-medium rounded-xl shadow-lg"
                onClick={() => window.open('https://clarity.microsoft.com/projects/view/x6eohi99h7/dashboard?date=Last%203%20days', '_blank')}
              >
                Open Clarity Dashboard ↗
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
