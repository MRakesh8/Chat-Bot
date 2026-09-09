import { BillingSection } from "@/components/project/billing-section";

export default function BillingPage() {
  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 pt-16 md:p-8 text-foreground max-w-full overflow-x-hidden">
        <h1 className="text-4xl font-bold mb-10 text-transparent bg-clip-text bg-gradient-to-r from-white to-foreground/70 tracking-tight">Billing & Subscription</h1>
        
        <div className="max-w-3xl space-y-10">
          <BillingSection />
        </div>
      </div>
    </div>
  );
}
