import React from "react";
import { cn } from "@/lib/utils";

export interface NovaBrandProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * - "full": Full NOVA Business AI wordmark
   * - "mark": Standalone gradient N symbol
   * - "app-icon": Square rounded app icon badge
   */
  variant?: "full" | "mark" | "app-icon";
  /**
   * Theme variant for the logo artwork:
   * - "dark": Optimized for dark backgrounds (#0B0A12)
   * - "light": Optimized for light backgrounds (#F9F8F4 / white)
   * - "auto": Automatically switches via CSS dark mode
   */
  theme?: "dark" | "light" | "auto";
  /**
   * Configurable display height (e.g., "1.75rem", "2rem", 28). Aspect ratio is preserved automatically.
   */
  height?: number | string;
  className?: string;
  /**
   * If true, renders accessible brand text alongside mark/icon variants.
   */
  showText?: boolean;
  alt?: string;
  /**
   * If true (default), uses transparent PNG variants. Set to false to use original JPG assets.
   */
  usePng?: boolean;
}

export const NovaBrand = React.forwardRef<HTMLDivElement, NovaBrandProps>(
  (
    {
      variant = "full",
      theme = "dark",
      height,
      className,
      showText = false,
      alt = "NOVA Business AI",
      usePng = true,
      style,
      ...props
    },
    ref
  ) => {
    const basePath = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
    const ext = usePng ? "png" : "jpg";

    if (variant === "app-icon") {
      const src = `${basePath}/brand/nova-app-icon.jpg`;
      const computedHeight = typeof height === "number" ? `${height}px` : height || "2rem";

      return (
        <div ref={ref} className={cn("inline-flex items-center gap-2.5 select-none shrink-0", className)} style={style} {...props}>
          <img
            src={src}
            alt={alt}
            style={{ height: computedHeight, width: computedHeight }}
            className="rounded-xl object-contain shadow-sm shrink-0"
            loading="eager"
            decoding="async"
          />
          {showText && (
            <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1">
              NOVA <span className="text-primary font-medium text-xs">Business AI</span>
            </span>
          )}
        </div>
      );
    }

    if (variant === "mark") {
      const darkSrc = `${basePath}/brand/nova-mark-dark.${ext}`;
      const lightSrc = `${basePath}/brand/nova-mark-light.${ext}`;
      const src = theme === "light" ? lightSrc : darkSrc;
      const computedHeight = typeof height === "number" ? `${height}px` : height || "1.75rem";

      return (
        <div ref={ref} className={cn("inline-flex items-center gap-2 select-none shrink-0", className)} style={style} {...props}>
          {theme === "auto" ? (
            <>
              <img
                src={darkSrc}
                alt={alt}
                style={{ height: computedHeight, width: "auto" }}
                className="hidden dark:block object-contain shrink-0"
                loading="eager"
                decoding="async"
              />
              <img
                src={lightSrc}
                alt={alt}
                style={{ height: computedHeight, width: "auto" }}
                className="block dark:hidden object-contain shrink-0"
                loading="eager"
                decoding="async"
              />
            </>
          ) : (
            <img
              src={src}
              alt={alt}
              style={{ height: computedHeight, width: "auto" }}
              className="object-contain shrink-0"
              loading="eager"
              decoding="async"
            />
          )}
          {showText && (
            <span className="font-bold tracking-tight text-foreground text-sm flex items-center gap-1">
              NOVA <span className="text-primary font-medium text-xs">Business AI</span>
            </span>
          )}
        </div>
      );
    }

    // Default: full wordmark
    const darkSrc = `${basePath}/brand/nova-logo-dark.${ext}`;
    const lightSrc = `${basePath}/brand/nova-logo-light.${ext}`;
    const src = theme === "light" ? lightSrc : darkSrc;
    const computedHeight = typeof height === "number" ? `${height}px` : height || "2.25rem";

    return (
      <div ref={ref} className={cn("inline-flex items-center select-none shrink-0", className)} style={style} {...props}>
        {theme === "auto" ? (
          <>
            <img
              src={darkSrc}
              alt={alt}
              style={{ height: computedHeight, width: "auto" }}
              className="hidden dark:block object-contain shrink-0"
              loading="eager"
              decoding="async"
            />
            <img
              src={lightSrc}
              alt={alt}
              style={{ height: computedHeight, width: "auto" }}
              className="block dark:hidden object-contain shrink-0"
              loading="eager"
              decoding="async"
            />
          </>
        ) : (
          <img
            src={src}
            alt={alt}
            style={{ height: computedHeight, width: "auto" }}
            className="object-contain shrink-0"
            loading="eager"
            decoding="async"
          />
        )}
      </div>
    );
  }
);

NovaBrand.displayName = "NovaBrand";
