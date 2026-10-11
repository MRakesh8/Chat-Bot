import React, { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { useLocation } from "wouter";
import { AlertCircle, RefreshCw, Home, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError } from "@/lib/lazy-with-retry";

interface RouteErrorBoundaryProps {
  children: ReactNode;
  location?: string;
  onReset?: () => void;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  failedLocation: string | null;
}

export class RouteErrorBoundaryClass extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      failedLocation: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[NOVA RouteErrorBoundary] Uncaught route render error:", error, errorInfo);
    this.setState({
      errorInfo,
      failedLocation: this.props.location || (typeof window !== "undefined" ? window.location.pathname : null),
    });
  }

  componentDidUpdate(prevProps: RouteErrorBoundaryProps) {
    // Automatically reset when location changes so navigating to a different page succeeds
    if (this.state.hasError && prevProps.location !== this.props.location) {
      this.resetError();
    }
  }

  resetError = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      failedLocation: null,
    });
    this.props.onReset?.();
  };

  handleReload = () => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, showDetails } = this.state;
    const isChunk = error ? isChunkLoadError(error) : false;

    return (
      <div className="flex-1 w-full flex items-center justify-center p-6 md:p-12 min-h-[400px]">
        <div className="max-w-lg w-full bg-card/90 backdrop-blur-xl border border-border/80 rounded-3xl p-8 shadow-xl text-center space-y-6 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto shadow-inner">
            <AlertCircle className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
              {isChunk ? "Page Update Available" : "Unable to Load Page"}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
              {isChunk
                ? "A new version of NOVA Business AI was published or a network connection issue occurred while loading this page."
                : "An unexpected error occurred while rendering this section. You can retry or navigate to another page."}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              onClick={this.handleReload}
              className="w-full sm:w-auto gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 px-5 text-xs font-semibold shadow-xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reload Page
            </Button>
            <Button
              variant="outline"
              onClick={this.resetError}
              className="w-full sm:w-auto gap-2 rounded-xl h-10 px-5 text-xs font-semibold border-border hover:bg-secondary"
            >
              Try Again
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/projects";
                }
              }}
              className="w-full sm:w-auto gap-2 rounded-xl h-10 px-4 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <Home className="w-3.5 h-3.5" />
              Projects
            </Button>
          </div>

          {error && (
            <div className="pt-2 text-left">
              <button
                type="button"
                onClick={() => this.setState({ showDetails: !showDetails })}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground font-mono mx-auto cursor-pointer"
              >
                <span>Diagnostics</span>
                {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
              {showDetails && (
                <div className="mt-3 p-3 bg-muted/60 border border-border/60 rounded-xl text-[11px] font-mono text-muted-foreground overflow-x-auto max-h-36">
                  <p className="font-semibold text-foreground/80 break-words">{error.message}</p>
                  {error.stack && (
                    <pre className="mt-1 text-[10px] text-muted-foreground/80 whitespace-pre-wrap break-all opacity-80">
                      {error.stack.split("\n").slice(0, 4).join("\n")}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
}

/**
 * Functional wrapper that injects Wouter's current location into RouteErrorBoundaryClass
 * ensuring automatic error clearance when the route changes.
 */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <RouteErrorBoundaryClass location={location}>{children}</RouteErrorBoundaryClass>;
}

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Top-level application error boundary that prevents any catastrophic unhandled
 * crash from turning into a blank screen.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[NOVA AppErrorBoundary] Fatal root error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[100dvh] w-full flex items-center justify-center bg-background text-foreground p-6">
          <div className="max-w-md w-full text-center space-y-6 bg-card border border-border p-8 rounded-3xl shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight">Something went wrong</h1>
              <p className="text-sm text-muted-foreground leading-relaxed">
                The application encountered an unexpected error. Refreshing should resolve this.
              </p>
            </div>
            <div className="pt-2">
              <Button
                onClick={() => window.location.reload()}
                className="w-full gap-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-10 shadow-xs"
              >
                <RefreshCw className="w-4 h-4" /> Reload Application
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
