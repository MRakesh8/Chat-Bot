import { BillingSection } from "@/components/project/billing-section";
import { Badge } from "@/components/ui/badge";

export default function BillingPage() {
  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-4xl mx-auto space-y-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-xs px-2.5 py-0.5 rounded-full font-semibold">
              Global Account Scope
            </Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Billing & Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your plan subscription, usage limits, payment methods, and invoices.</p>
        </div>
        
        <div className="space-y-8">
          <BillingSection />
        </div>
      </div>
    </div>
  );
}
