import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  CreditCard, 
  ShieldCheck, 
  ShieldAlert, 
  Loader2, 
  QrCode, 
  CheckCircle2, 
  ArrowRight, 
  Clock, 
  Copy,
  Sparkles,
  Zap
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  isActive: boolean;
};

interface BillingSectionProps {
  projectId?: string;
}

export function BillingSection({ projectId: initialProjectId }: BillingSectionProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedProjectId, setSelectedProjectId] = useState<string>(initialProjectId || "");
  const [utr, setUtr] = useState("");
  const [method, setMethod] = useState("UPI");

  const authFetch = async (url: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers as any || {}),
      },
    });
  };

  // 1. Fetch available projects if not passed in
  const { data: projectList } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => {
      const res = await authFetch(apiUrl("/api/projects"));
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
    enabled: !initialProjectId && !!session,
  });

  const activeProjectId = initialProjectId || selectedProjectId || projectList?.[0]?.id;

  // 2. Fetch Payment & License Status from Agent 1's API
  const { data: statusData, isLoading, refetch } = useQuery({
    queryKey: ["payment-status", activeProjectId],
    queryFn: async () => {
      const res = await authFetch(apiUrl(`/api/payments/status/${activeProjectId}`));
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch billing status");
      }
      return res.json() as Promise<{
        status: "pending" | "paid" | "failed" | "unpaid";
        licenseStatus: "active" | "inactive";
        upiId: string;
        qrCodeUrl: string;
      }>;
    },
    enabled: !!activeProjectId && !!session,
  });

  // 3. Submit Manual Payment (UTR Reference)
  const manualPaymentMutation = useMutation({
    mutationFn: async (data: { projectId: string; utrTransactionId: string; method: string; screenshotUrl: string }) => {
      const res = await authFetch(apiUrl("/api/payments/manual"), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit payment");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyPaid) {
        toast({ title: "License Active", description: "This project is already fully activated." });
      } else {
        toast({
          title: "Payment Reference Submitted! 🎉",
          description: "Our team will verify your UTR reference shortly. Your workspace license update is pending.",
        });
      }
      setUtr("");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["project", activeProjectId] });
    },
    onError: (err: Error) => {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    },
  });

  // 4. Create Razorpay Subscription
  const razorpayMutation = useMutation({
    mutationFn: async (data: { projectId: string; planId: string }) => {
      const res = await authFetch(apiUrl("/api/payments/razorpay/create-subscription"), {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Razorpay initialization failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.subscriptionId && (window as any).Razorpay) {
        const options = {
          key: data.keyId,
          subscription_id: data.subscriptionId,
          name: "RAGHUB",
          description: data.description || "Pro Plan Subscription",
          handler: function () {
            toast({ title: "Payment Successful!", description: "Subscription activated successfully." });
            refetch();
            queryClient.invalidateQueries({ queryKey: ["project", activeProjectId] });
          },
        };
        const rzp = new (window as any).Razorpay(options);
        rzp.open();
      } else {
        toast({
          title: "Subscription Initialized",
          description: "Payment gateway reference generated. Complete payment via UPI or contact support.",
        });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Payment Gateway Error", description: err.message, variant: "destructive" });
    },
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId) {
      toast({ title: "Please select a project", variant: "destructive" });
      return;
    }
    if (!utr.trim()) {
      toast({ title: "UTR / Reference ID required", variant: "destructive" });
      return;
    }
    manualPaymentMutation.mutate({
      projectId: activeProjectId,
      utrTransactionId: utr.trim(),
      method,
      screenshotUrl: "",
    });
  };

  const copyUpiId = () => {
    if (statusData?.upiId) {
      navigator.clipboard.writeText(statusData.upiId);
      toast({ title: "UPI ID Copied!", description: statusData.upiId });
    }
  };

  return (
    <Card className="bg-card border-border shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
          <CreditCard className="w-5 h-5 text-primary" /> Subscription & Licensing
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Manage your plan, check license status, and process upgrades.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Project Selector if not fixed */}
        {!initialProjectId && projectList && projectList.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Project</label>
            <Select value={activeProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="w-full bg-background border-border">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border text-popover-foreground">
                {projectList.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Current Plan Status Banner */}
        {isLoading ? (
          <div className="flex items-center justify-center p-8 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading license status...
          </div>
        ) : statusData ? (
          <div className="p-5 rounded-2xl bg-foreground/[0.02] border border-foreground/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Project Status</p>
                <div className="flex items-center gap-2 mt-1">
                  <h3 className="text-lg font-bold text-foreground">
                    {statusData.licenseStatus === "active" ? "Pro License Active" : "Free Trial / Inactive"}
                  </h3>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusData.licenseStatus === "active" ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1 px-3 py-1 text-xs">
                    <ShieldCheck className="w-4 h-4" /> Active
                  </Badge>
                ) : statusData.status === "pending" ? (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-400 border-amber-500/20 gap-1 px-3 py-1 text-xs">
                    <Clock className="w-4 h-4" /> Verification Pending
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1 px-3 py-1 text-xs">
                    <ShieldAlert className="w-4 h-4" /> Unpaid / Trial
                  </Badge>
                )}
              </div>
            </div>

            {statusData.status === "pending" && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-center gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Your payment reference is under verification by our team. Access will update automatically once verified.</span>
              </div>
            )}
          </div>
        ) : null}

        {/* Plans Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {/* Free Trial / Starter */}
          <div className="p-5 rounded-2xl border border-border bg-background flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="text-xs">Starter</Badge>
                <span className="text-xs text-muted-foreground">Free</span>
              </div>
              <h4 className="text-xl font-bold text-foreground">Free Trial</h4>
              <p className="text-xs text-muted-foreground mt-1">Full feature access during initial website crawl and testing.</p>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 1 AI Project Assistant</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Website Crawling & Knowledge</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Embeddable Widget</li>
              </ul>
            </div>
            <Button variant="outline" disabled className="w-full text-xs">
              Current Base Tier
            </Button>
          </div>

          {/* Pro Plan Upgrade */}
          <div className="p-5 rounded-2xl border border-primary/40 bg-primary/5 flex flex-col justify-between space-y-4 relative overflow-hidden">
            <div className="absolute top-3 right-3">
              <Badge className="bg-primary text-primary-foreground text-[10px] gap-1">
                <Sparkles className="w-3 h-3" /> Recommended
              </Badge>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Badge variant="outline" className="text-xs border-primary/30 text-primary">Pro Business</Badge>
                <div className="text-right">
                  <span className="text-lg font-bold text-foreground">₹499</span>
                  <span className="text-xs text-muted-foreground"> / Month</span>
                </div>
              </div>
              <h4 className="text-xl font-bold text-foreground">Pro Deployment</h4>
              <p className="text-xs text-muted-foreground mt-1">Unlimited live visitor AI responses, full integrations, and priority support.</p>
              <ul className="mt-4 space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-primary" /> High-volume AI responses</li>
                <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-primary" /> Live Shopify & Webhook Actions</li>
                <li className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-primary" /> Custom Branding & Context Engine</li>
              </ul>
            </div>

            <Button
              onClick={() => {
                if (activeProjectId) {
                  razorpayMutation.mutate({ projectId: activeProjectId, planId: "00000000-0000-0000-0000-000000000002" });
                }
              }}
              disabled={razorpayMutation.isPending || !activeProjectId}
              className="w-full bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 text-primary-foreground text-xs gap-2 font-medium"
            >
              {razorpayMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              Pay Online / Subscribe
            </Button>
          </div>
        </div>

        {/* Manual Payment Section (UPI / Bank Transfer) */}
        <div className="pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
            <QrCode className="w-4 h-4 text-emerald-500" /> Direct UPI / Manual Reference Payment
          </h4>
          <p className="text-xs text-muted-foreground mb-4">
            If you prefer direct UPI transfer, pay using the UPI ID below and enter your UTR / Reference ID for verification.
          </p>

          <div className="p-4 rounded-xl bg-muted/40 border border-border space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-muted-foreground uppercase font-semibold">Business UPI ID</p>
                <p className="font-mono text-sm font-bold text-foreground">{statusData?.upiId || "rakesh837m@okaxis"}</p>
              </div>
              <Button size="sm" variant="outline" onClick={copyUpiId} className="h-8 text-xs gap-1.5 border-border">
                <Copy className="w-3 h-3" /> Copy UPI ID
              </Button>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">Payment Method</label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-9 text-xs bg-background border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border-border text-popover-foreground">
                      <SelectItem value="UPI">UPI Transfer</SelectItem>
                      <SelectItem value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[11px] text-muted-foreground font-medium mb-1 block">UTR / Transaction Reference ID</label>
                  <Input
                    placeholder="e.g. 325491823019"
                    value={utr}
                    onChange={(e) => setUtr(e.target.value)}
                    className="h-9 text-xs bg-background border-border font-mono"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={manualPaymentMutation.isPending || !utr.trim() || !activeProjectId}
                className="w-full sm:w-auto h-9 px-5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white gap-2 font-medium"
              >
                {manualPaymentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Submit Payment Reference
              </Button>
            </form>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
