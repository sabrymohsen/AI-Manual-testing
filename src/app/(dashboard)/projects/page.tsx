"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2 } from "lucide-react"

interface Project {
  id: string
  name: string
  webAppUrl: string
  environment: string
  browserType: string
  createdAt: string
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  async function fetchProjects() {
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    const res = await fetch(`/api/projects?${params}`)
    if (res.ok) {
      const data = await res.json()
      setProjects(data.projects)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchProjects()
  }, [search])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Projects</h1>
        <Link href="/projects/new">
          <Button>New Project</Button>
        </Link>
      </div>

      <Input
        placeholder="Search projects..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <p className="text-muted-foreground">Loading projects...</p>
      ) : projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No projects yet</p>
          <Link href="/projects/new">
            <Button variant="outline" className="mt-4">
              Create your first project
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="block border rounded-lg p-4 hover:bg-accent transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{project.name}</h3>
                  <p className="text-sm text-muted-foreground">{project.webAppUrl}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-xs bg-secondary px-2 py-1 rounded">
                    {project.environment}
                  </span>
                  <span className="text-xs bg-secondary px-2 py-1 rounded">
                    {project.browserType}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    onClick={async (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (confirm(`Are you sure you want to delete the project "${project.name}"? This will delete all its test cases, test runs, and bug reports.`)) {
                        const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" })
                        if (res.ok) {
                          fetchProjects()
                        } else {
                          alert("Failed to delete project")
                        }
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
