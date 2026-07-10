import { Skeleton } from "./skeleton"

export function CardSkeleton() {
  return (
    <div className="flex flex-col space-y-3 p-4 border border-border rounded-xl bg-card">
      <Skeleton className="h-6 w-[200px]" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-[80%]" />
      <div className="flex justify-between items-center pt-4">
        <Skeleton className="h-4 w-[100px]" />
        <Skeleton className="h-8 w-[100px] rounded-lg" />
      </div>
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="w-full rounded-md border border-border bg-card overflow-hidden">
      <div className="border-b border-border bg-muted/20 p-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-border/50">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function MessageSkeleton({ role = "user" }: { role?: "user" | "assistant" }) {
  const isUser = role === "user"
  return (
    <div className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`flex max-w-[80%] gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
        <div className="flex flex-col gap-2">
          <Skeleton className={`h-16 ${isUser ? "w-[200px]" : "w-[300px]"} rounded-2xl ${isUser ? "rounded-tr-sm" : "rounded-tl-sm"}`} />
          <Skeleton className="h-3 w-[60px]" />
        </div>
      </div>
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="flex items-center space-x-4">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-[250px]" />
        <Skeleton className="h-4 w-[200px]" />
      </div>
    </div>
  )
}
