import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../../contexts/AuthContext";
import { apiUrl } from "@/lib/api-url";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ShopifyConnectDialogProps {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShopifyConnectDialog({ projectId, open, onOpenChange }: ShopifyConnectDialogProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [shop, setShop] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [environment, setEnvironment] = useState<"test" | "production">("test");

  const connectMutation = useMutation({
    mutationFn: async () => {
      // Basic formatting cleanup
      const cleanShop = shop.replace(/^https?:\/\//, "").replace(/\/$/, "");
      
      const res = await fetch(apiUrl(`/api/projects/${projectId}/integrations/connect`), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          provider: "shopify",
          credentials: {
            shop: cleanShop,
            accessToken
          },
          config: {
            shop: cleanShop,
            environment
          }
        })
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to connect");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Connected to Shopify", description: "Integration created. Please verify it next." });
      queryClient.invalidateQueries({ queryKey: ["project-integrations", projectId] });
      setShop("");
      setAccessToken("");
      setEnvironment("test");
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: "Connection Failed", description: err.message, variant: "destructive" });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Shopify Store</DialogTitle>
          <DialogDescription>
            Provide your Shopify Admin API credentials to connect your store.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="environment">Store Environment</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={environment === "test" ? "default" : "outline"}
                className={environment === "test" ? "bg-amber-600 hover:bg-amber-500 text-white" : ""}
                onClick={() => setEnvironment("test")}
              >
                Development / Sandbox
              </Button>
              <Button
                type="button"
                variant={environment === "production" ? "default" : "outline"}
                className={environment === "production" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : ""}
                onClick={() => setEnvironment("production")}
              >
                Production Store
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {environment === "test" 
                ? "Safe staging sandbox: used for safe agent execution, testing, and capability trials."
                : "Live production store: all actions modify real catalog/orders."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shop">Shop Domain</Label>
            <Input
              id="shop"
              placeholder="e.g. your-store.myshopify.com"
              value={shop}
              onChange={(e) => setShop(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token">Admin API Access Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="shpat_..."
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              These credentials will be encrypted at rest and never exposed to the AI model or frontend.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => connectMutation.mutate()} 
            disabled={!shop || !accessToken || connectMutation.isPending}
            className="bg-gradient-to-r from-violet-600 to-indigo-600"
          >
            {connectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
