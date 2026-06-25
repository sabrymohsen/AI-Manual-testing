import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AlertProvider } from "@/components/ui/alert-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AI Manual QA Tester",
  description: "Create and execute browser-based functional tests with AI assistance",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AlertProvider>{children}</AlertProvider>
      </body>
    </html>
  )
}
