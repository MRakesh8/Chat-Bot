import { ApiCenter } from "@/components/api-center/ApiCenter";

export default function ApiCenterPage() {
  return (
    <div className="flex w-full h-full bg-transparent overflow-x-hidden">
      <div className="flex-1 p-6 md:p-8 text-foreground max-w-5xl mx-auto space-y-6">
        <ApiCenter />
      </div>
    </div>
  );
}
