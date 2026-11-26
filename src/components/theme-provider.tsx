"use client"

import { ThemeProvider as NextThemes } from "next-themes"

/** Light, dark or follow the system. The choice is kept per browser and in the profile. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemes attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange storageKey="qa-theme">
      {children}
    </NextThemes>
  )
}
