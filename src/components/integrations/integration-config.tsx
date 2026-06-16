"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Shield, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react"

interface IntegrationConfigProps {
  projectId: string
}

export function IntegrationConfig({ projectId }: IntegrationConfigProps) {
  const [provider, setProvider] = useState<string>("none")
  const [enabled, setEnabled] = useState<boolean>(false)
  const [host, setHost] = useState<string>("")
  const [projectKey, setProjectKey] = useState<string>("")
  const [username, setUsername] = useState<string>("")
  const [token, setToken] = useState<string>("")
  const [triggerOn, setTriggerOn] = useState<string>("Failed")
  const [hasToken, setHasToken] = useState<boolean>(false)

  const [loading, setLoading] = useState<boolean>(true)
  const [saving, setSaving] = useState<boolean>(false)
  const [testing, setTesting] = useState<boolean>(false)

  const [error, setError] = useState<string>("")
  const [success, setSuccess] = useState<string>("")
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch(`/api/projects/${projectId}/integrations`)
        if (res.ok) {
          const data = await res.json()
          if (data.integration) {
            setProvider(data.integration.provider)
            setEnabled(data.integration.enabled)
            setHost(data.integration.host)
            setProjectKey(data.integration.projectKey)
            setUsername(data.integration.username)
            setTriggerOn(data.integration.triggerOn)
            setHasToken(data.integration.hasToken)
          }
        }
      } catch (err) {
        console.error("Failed to load integration settings:", err)
      } finally {
        setLoading(false)
      }
    }
    loadSettings()
  }, [projectId])

  async function handleTest() {
    setTesting(true)
    setError("")
    setSuccess("")
    setTestResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/integrations/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          host,
          projectKey,
          username,
          token: token || undefined // Will use stored token if not dirty
        })
      })

      const data = await res.json()
      if (res.ok) {
        setTestResult({ success: true, message: data.message || "Connection successful!" })
      } else {
        setTestResult({ success: false, message: data.error || "Connection failed." })
      }
    } catch (err) {
      setTestResult({ success: false, message: "Network error testing connection" })
    } finally {
      setTesting(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError("")
    setSuccess("")
    setTestResult(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/integrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          enabled: provider !== "none" ? enabled : false,
          host,
          projectKey,
          username,
          token: token || undefined,
          triggerOn
        })
      })

      const data = await res.json()
      if (res.ok) {
        setSuccess("Integration settings saved successfully!")
        if (data.integration) {
          setHasToken(data.integration.hasToken)
          setToken("") // Clear input field after successful save
        }
      } else {
        setError(data.error || "Failed to save settings")
      }
    } catch {
      setError("Failed to save settings due to a network error")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 space-x-2 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Loading integrations...</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b pb-2">
        <div>
          <h3 className="font-semibold text-base">Project Integrations</h3>
          <p className="text-xs text-muted-foreground">
            Automatically log bugs or status tasks in external tools like Jira, Azure DevOps, or OpenProject.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full font-medium border border-emerald-200">
          <Shield className="h-3.5 w-3.5" />
          Encrypted Storage
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="provider-select">Select Integration Provider</Label>
          <select
            id="provider-select"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value)
              setTestResult(null)
              if (e.target.value !== "none" && !enabled) {
                setEnabled(true)
              }
            }}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="none">None / Disabled</option>
            <option value="jira">Jira Software (Cloud)</option>
            <option value="azure_devops">Azure DevOps (Boards)</option>
            <option value="openproject">OpenProject</option>
          </select>
        </div>

        {provider !== "none" && (
          <div className="space-y-4 pt-2 border-t border-dashed">
            <div className="flex items-center space-x-2">
              <input
                id="enable-integration"
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="enable-integration" className="cursor-pointer font-medium">
                Enable this integration
              </Label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="integration-host">
                  {provider === "jira" ? "Jira Domain / Host URL" :
                   provider === "azure_devops" ? "Azure DevOps Organization" :
                   "OpenProject Host URL"}
                </Label>
                <Input
                  id="integration-host"
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder={
                    provider === "jira" ? "your-subdomain.atlassian.net" :
                    provider === "azure_devops" ? "dev.azure.com/your-org" :
                    "https://openproject.example.com"
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="integration-project">
                  {provider === "jira" ? "Project Key" :
                   provider === "azure_devops" ? "Project Name / Key" :
                   "Project Identifier (Slug or ID)"}
                </Label>
                <Input
                  id="integration-project"
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value)}
                  placeholder={
                    provider === "jira" ? "PROJ" :
                    provider === "azure_devops" ? "MyProject" :
                    "my-project-slug"
                  }
                />
              </div>

              {provider !== "azure_devops" && (
                <div className="space-y-2">
                  <Label htmlFor="integration-user">
                    {provider === "jira" ? "Atlassian Account Email" : "Username"}
                  </Label>
                  <Input
                    id="integration-user"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={
                      provider === "jira" ? "qa-team@example.com" : "admin"
                    }
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="integration-token">
                  {provider === "jira" ? "Atlassian API Token" :
                   provider === "azure_devops" ? "Personal Access Token (PAT)" :
                   "API Token / Key"}
                </Label>
                <Input
                  id="integration-token"
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder={hasToken ? "•••••••••••••••• (Leave blank to keep saved)" : "Enter API token"}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="integration-trigger">Trigger Integrations On</Label>
                <select
                  id="integration-trigger"
                  value={triggerOn}
                  onChange={(e) => setTriggerOn(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Failed">Failed test runs only (Logs bug report)</option>
                  <option value="All">All test runs (Logs passing tasks and bug reports)</option>
                </select>
              </div>
            </div>

            {testResult && (
              <div className={`flex items-start gap-2.5 p-3 rounded-lg border text-sm ${
                testResult.success 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                  : "bg-destructive/10 border-destructive/20 text-destructive-foreground"
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
                )}
                <div>
                  <p className="font-semibold">{testResult.success ? "Connection Success" : "Connection Failure"}</p>
                  <p className="text-xs opacity-90 mt-0.5">{testResult.message}</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testing || !host || !projectKey}
              >
                {testing ? "Testing..." : "Test Connection"}
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && <p className="text-sm text-emerald-600">{success}</p>}

        <div className="pt-2 border-t">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </div>
  )
}
