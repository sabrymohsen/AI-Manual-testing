"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">AI Provider</h2>
        <div className="space-y-2">
          <Label htmlFor="aiProvider">API Base URL</Label>
          <Input id="aiProvider" placeholder="https://api.openai.com/v1" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="aiKey">API Key</Label>
          <Input id="aiKey" type="password" placeholder="sk-..." />
        </div>
        <Button>Save AI Settings</Button>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Figma</h2>
        <div className="space-y-2">
          <Label htmlFor="figmaToken">Figma API Token</Label>
          <Input id="figmaToken" type="password" placeholder="figd_..." />
        </div>
        <Button>Save Figma Token</Button>
      </div>

      <div className="border rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Default Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="defaultBrowser">Default Browser</Label>
            <select id="defaultBrowser" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option>Chromium</option>
              <option>Firefox</option>
              <option>WebKit</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultViewport">Default Viewport</Label>
            <select id="defaultViewport" className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option>Desktop (1280x800)</option>
              <option>Tablet (768x1024)</option>
              <option>Mobile (375x667)</option>
            </select>
          </div>
        </div>
        <Button>Save Defaults</Button>
      </div>
    </div>
  )
}
