"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { swapTheme, type ThemeTransitionVariant } from "@/lib/theme-transition";

export function ThemeToggle({
  variant = "crossfade",
  label = "Toggle theme",
}: {
  /** How the swap animates. See `lib/theme-transition.ts`. */
  variant?: ThemeTransitionVariant;
  /** Accessible name. Only worth setting when two toggles share a surface. */
  label?: string;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // The circular reveal grows from whatever the visitor actually clicked.
  const button = useRef<HTMLButtonElement>(null);

  return (
    <Button
      ref={button}
      variant="ghost"
      size="icon"
      aria-label={label}
      onClick={() =>
        swapTheme({
          theme: isDark ? "light" : "dark",
          apply: setTheme,
          variant,
          origin: button.current,
        })
      }
    >
      <Sun className="h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
      <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
    </Button>
  );
}
