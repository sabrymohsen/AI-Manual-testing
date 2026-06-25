"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { 
  Folder, 
  FolderOpen, 
  ChevronRight, 
  ChevronDown, 
  Plus, 
  Edit2, 
  Trash2, 
  Play, 
  FileText, 
  Layers, 
  Box, 
  MoreVertical, 
  Maximize2, 
  Minimize2, 
  Search,
  ArrowRightLeft,
  Loader2
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { HierarchyFormModal } from "./hierarchy-form-modal"
import { MoveCaseModal } from "./move-case-modal"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ComponentNode {
  id: string
  name: string
  description?: string | null
  orderIndex: number
  featureId: string
  moduleId: string
}

interface FeatureNode {
  id: string
  name: string
  description?: string | null
  orderIndex: number
  moduleId: string
  components: ComponentNode[]
}

interface ModuleNode {
  id: string
  name: string
  description?: string | null
  orderIndex: number
  features: FeatureNode[]
}

interface TestCase {
  id: string
  title: string
  priority: string
  source: string
  moduleId?: string | null
  featureId?: string | null
  componentId?: string | null
  steps: Array<{ id: string }>
}

interface HierarchyExplorerProps {
  projectId: string
  onStartTestRun: (testCaseId: string) => void
  runningTestId: string | null
}

export function HierarchyExplorer({
  projectId,
  onStartTestRun,
  runningTestId
}: HierarchyExplorerProps) {
  const router = useRouter()
  const [modules, setModules] = useState<ModuleNode[]>([])
  const [testCases, setTestCases] = useState<TestCase[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})

  // Form Modal state
  const [formModalOpen, setFormModalOpen] = useState(false)
  const [formLevel, setFormLevel] = useState<"module" | "feature" | "component">("module")
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formEditData, setFormEditData] = useState<any>(undefined)
  const [parentModuleId, setParentModuleId] = useState<string | undefined>(undefined)
  const [parentFeatureId, setParentFeatureId] = useState<string | undefined>(undefined)

  // Move Modal state
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveTestCaseId, setMoveTestCaseId] = useState("")
  const [moveTestCaseTitle, setMoveTestCaseTitle] = useState("")
  const [moveCurrentModuleId, setMoveCurrentModuleId] = useState<string | null>(null)
  const [moveCurrentFeatureId, setMoveCurrentFeatureId] = useState<string | null>(null)
  const [moveCurrentComponentId, setMoveCurrentComponentId] = useState<string | null>(null)

  // Delete modal states
  const [nodeToDelete, setNodeToDelete] = useState<{ level: "module" | "feature" | "component"; id: string; name: string } | null>(null)
  const [testCaseToDelete, setTestCaseToDelete] = useState<{ id: string; title: string } | null>(null)

  // Fetch all hierarchy and cases
  const fetchData = async () => {
    try {
      setLoading(true)
      const [hierarchyRes, testCasesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/hierarchy`),
        fetch(`/api/projects/${projectId}/test-cases`)
      ])
      const hierarchyData = await hierarchyRes.json()
      const testCasesData = await testCasesRes.json()

      setModules(hierarchyData.modules || [])
      setTestCases(testCasesData.testCases || [])
    } catch (err) {
      console.error("Error loading hierarchy:", err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [projectId])

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }))
  }

  const expandAll = () => {
    const newExpanded: Record<string, boolean> = {}
    modules.forEach((m) => {
      newExpanded[m.id] = true
      m.features.forEach((f) => {
        newExpanded[f.id] = true
        f.components.forEach((c) => {
          newExpanded[c.id] = true
        })
      })
    })
    newExpanded["unassigned"] = true
    setExpandedNodes(newExpanded)
  }

  const collapseAll = () => {
    setExpandedNodes({})
  }

  // Node deletion handlers
  const handleDeleteNode = (level: "module" | "feature" | "component", id: string, name: string) => {
    setNodeToDelete({ level, id, name })
  }

  const handleDeleteTestCase = (tcId: string, tcTitle: string) => {
    setTestCaseToDelete({ id: tcId, title: tcTitle })
  }

  async function confirmDeleteNode() {
    if (!nodeToDelete) return
    const { level, id } = nodeToDelete
    const res = await fetch(`/api/${level}s/${id}`, {
      method: "DELETE"
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error || `Failed to delete ${level}`)
    }
    setNodeToDelete(null)
    fetchData()
  }

  async function confirmDeleteTestCase() {
    if (!testCaseToDelete) return
    const { id } = testCaseToDelete
    const res = await fetch(`/api/projects/${projectId}/test-cases/${id}`, {
      method: "DELETE"
    })

    if (!res.ok) {
      throw new Error("Failed to delete test case")
    }
    setTestCaseToDelete(null)
    fetchData()
  }

  // Modal open helpers
  const openCreateModule = () => {
    setFormLevel("module")
    setFormMode("create")
    setFormEditData(undefined)
    setParentModuleId(undefined)
    setParentFeatureId(undefined)
    setFormModalOpen(true)
  }

  const openCreateFeature = (moduleId: string) => {
    setFormLevel("feature")
    setFormMode("create")
    setFormEditData(undefined)
    setParentModuleId(moduleId)
    setParentFeatureId(undefined)
    setFormModalOpen(true)
  }

  const openCreateComponent = (featureId: string) => {
    setFormLevel("component")
    setFormMode("create")
    setFormEditData(undefined)
    setParentModuleId(undefined)
    setParentFeatureId(featureId)
    setFormModalOpen(true)
  }

  const openEditNode = (level: "module" | "feature" | "component", node: any) => {
    setFormLevel(level)
    setFormMode("edit")
    setFormEditData(node)
    setFormModalOpen(true)
  }

  const openMoveCase = (tc: TestCase) => {
    setMoveTestCaseId(tc.id)
    setMoveTestCaseTitle(tc.title)
    setMoveCurrentModuleId(tc.moduleId || null)
    setMoveCurrentFeatureId(tc.featureId || null)
    setMoveCurrentComponentId(tc.componentId || null)
    setMoveModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm">Loading test hierarchy...</p>
      </div>
    )
  }

  // Filter test cases, modules, features, components by search query
  const matchesSearch = (text: string) => {
    if (!searchQuery) return true
    return text.toLowerCase().includes(searchQuery.toLowerCase())
  }

  // Categorize Test Cases
  const getCasesForModuleOnly = (moduleId: string) => 
    testCases.filter(tc => tc.moduleId === moduleId && !tc.featureId && matchesSearch(tc.title))
  const getCasesForFeatureOnly = (featureId: string) => 
    testCases.filter(tc => tc.featureId === featureId && !tc.componentId && matchesSearch(tc.title))
  const getCasesForComponent = (componentId: string) => 
    testCases.filter(tc => tc.componentId === componentId && matchesSearch(tc.title))
  const unassignedCases = testCases.filter(tc => !tc.moduleId && matchesSearch(tc.title))

  // Recursive count calculator
  const countCasesInModule = (m: ModuleNode): number => {
    let count = getCasesForModuleOnly(m.id).length
    m.features.forEach(f => {
      count += getCasesForFeatureOnly(f.id).length
      f.components.forEach(c => {
        count += getCasesForComponent(c.id).length
      })
    })
    return count
  }

  const countCasesInFeature = (f: FeatureNode): number => {
    let count = getCasesForFeatureOnly(f.id).length
    f.components.forEach(c => {
      count += getCasesForComponent(c.id).length
    })
    return count
  }

  const countCasesInComponent = (c: ComponentNode): number => {
    return getCasesForComponent(c.id).length
  }

  return (
    <div className="space-y-4">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-accent/10 p-3 rounded-xl border">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search hierarchy..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-4 py-2 w-full text-sm bg-background border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto justify-end">
          <Button variant="outline" size="sm" onClick={expandAll} className="flex items-center gap-1">
            <Maximize2 className="h-3.5 w-3.5" /> Expand All
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} className="flex items-center gap-1">
            <Minimize2 className="h-3.5 w-3.5" /> Collapse All
          </Button>
          <Button size="sm" onClick={openCreateModule} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white">
            <Plus className="h-4 w-4" /> Add Module
          </Button>
        </div>
      </div>

      {/* Hierarchy Tree */}
      <div className="border rounded-2xl bg-card overflow-hidden shadow-sm divide-y">
        
        {/* Unassigned cases */}
        {unassignedCases.length > 0 && (
          <div className="p-1">
            <div 
              className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/40 cursor-pointer group transition-colors"
              onClick={() => toggleExpand("unassigned")}
            >
              <div className="flex items-center gap-2">
                {expandedNodes["unassigned"] ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-semibold text-amber-600 dark:text-amber-500">Unassigned Test Cases</span>
                <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                  {unassignedCases.length}
                </span>
              </div>
            </div>
            
            {expandedNodes["unassigned"] && (
              <div className="pl-6 pr-2 py-1 space-y-1 bg-amber-500/5 rounded-b-lg border-t border-dashed border-amber-500/10">
                {unassignedCases.map((tc) => (
                  <TestCaseRow 
                    key={tc.id} 
                    tc={tc} 
                    runningTestId={runningTestId}
                    onStartTestRun={onStartTestRun}
                    onMove={openMoveCase}
                    onDelete={handleDeleteTestCase}
                    projectId={projectId}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Modules Tree */}
        {modules.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Layers className="h-8 w-8 mx-auto mb-2 text-indigo-400 opacity-60" />
            <p className="text-sm">No modules created yet. Add a module to start organizing your test suite.</p>
          </div>
        ) : (
          modules.map((m) => {
            const isModuleExpanded = expandedNodes[m.id]
            const moduleCasesCount = countCasesInModule(m)
            const moduleCases = getCasesForModuleOnly(m.id)

            return (
              <div key={m.id} className="p-1">
                {/* Module Row */}
                <div 
                  className="flex items-center justify-between p-2.5 rounded-lg hover:bg-accent/40 cursor-pointer group transition-colors"
                  onClick={() => toggleExpand(m.id)}
                >
                  <div className="flex items-center gap-2">
                    {isModuleExpanded ? (
                      <ChevronDown className="h-4 w-4 text-indigo-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-indigo-500" />
                    )}
                    <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="font-semibold text-foreground">{m.name}</span>
                    {m.description && (
                      <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden md:inline">
                        — {m.description}
                      </span>
                    )}
                    <span className="text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                      {moduleCasesCount}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button 
                      onClick={() => openCreateFeature(m.id)} 
                      title="Add Feature"
                      className="p-1 hover:bg-indigo-100 text-indigo-600 rounded dark:hover:bg-indigo-950"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => openEditNode("module", m)} 
                      title="Edit Module"
                      className="p-1 hover:bg-indigo-100 text-indigo-600 rounded dark:hover:bg-indigo-950"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteNode("module", m.id, m.name)} 
                      title="Delete Module"
                      className="p-1 hover:bg-red-100 text-red-600 rounded dark:hover:bg-red-950"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Module Contents */}
                {isModuleExpanded && (
                  <div className="pl-6 pr-2 py-1 space-y-2 border-l-2 border-indigo-200 dark:border-indigo-950/50 ml-4.5 mt-1 pb-2">
                    {/* Cases directly under module */}
                    {moduleCases.map((tc) => (
                      <TestCaseRow 
                        key={tc.id} 
                        tc={tc} 
                        runningTestId={runningTestId}
                        onStartTestRun={onStartTestRun}
                        onMove={openMoveCase}
                        onDelete={handleDeleteTestCase}
                        projectId={projectId}
                      />
                    ))}

                    {/* Features */}
                    {m.features.map((f) => {
                      const isFeatureExpanded = expandedNodes[f.id]
                      const featureCasesCount = countCasesInFeature(f)
                      const featureCases = getCasesForFeatureOnly(f.id)

                      return (
                        <div key={f.id} className="p-0.5">
                          {/* Feature Row */}
                          <div 
                            className="flex items-center justify-between p-2 rounded-lg hover:bg-accent/40 cursor-pointer group transition-colors"
                            onClick={() => toggleExpand(f.id)}
                          >
                            <div className="flex items-center gap-2">
                              {isFeatureExpanded ? (
                                <ChevronDown className="h-4 w-4 text-blue-500" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-blue-500" />
                              )}
                              <Folder className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                              <span className="font-medium text-foreground">{f.name}</span>
                              {f.description && (
                                <span className="text-xs text-muted-foreground truncate max-w-[200px] hidden md:inline">
                                  — {f.description}
                                </span>
                              )}
                              <span className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                                {featureCasesCount}
                              </span>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                              <button 
                                onClick={() => openCreateComponent(f.id)} 
                                title="Add Component"
                                className="p-1 hover:bg-blue-100 text-blue-600 rounded dark:hover:bg-blue-950"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => openEditNode("feature", f)} 
                                title="Edit Feature"
                                className="p-1 hover:bg-blue-100 text-blue-600 rounded dark:hover:bg-blue-950"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button 
                                onClick={() => handleDeleteNode("feature", f.id, f.name)} 
                                title="Delete Feature"
                                className="p-1 hover:bg-red-100 text-red-600 rounded dark:hover:bg-red-950"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Feature Contents */}
                          {isFeatureExpanded && (
                            <div className="pl-6 pr-2 py-1 space-y-2 border-l-2 border-blue-200 dark:border-blue-950/50 ml-4.5 mt-1 pb-2">
                              {/* Cases directly under feature */}
                              {featureCases.map((tc) => (
                                <TestCaseRow 
                                  key={tc.id} 
                                  tc={tc} 
                                  runningTestId={runningTestId}
                                  onStartTestRun={onStartTestRun}
                                  onMove={openMoveCase}
                                  onDelete={handleDeleteTestCase}
                                  projectId={projectId}
                                />
                              ))}

                              {/* Components */}
                              {f.components.map((c) => {
                                const isComponentExpanded = expandedNodes[c.id]
                                const componentCasesCount = countCasesInComponent(c)
                                const componentCases = getCasesForComponent(c.id)

                                return (
                                  <div key={c.id} className="p-0.5">
                                    {/* Component Row */}
                                    <div 
                                      className="flex items-center justify-between p-1.5 rounded-lg hover:bg-accent/40 cursor-pointer group transition-colors"
                                      onClick={() => toggleExpand(c.id)}
                                    >
                                      <div className="flex items-center gap-2">
                                        {isComponentExpanded ? (
                                          <ChevronDown className="h-3.5 w-3.5 text-emerald-500" />
                                        ) : (
                                          <ChevronRight className="h-3.5 w-3.5 text-emerald-500" />
                                        )}
                                        <Box className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                                        <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">
                                          {componentCasesCount}
                                        </span>
                                      </div>

                                      {/* Actions */}
                                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                                        <button 
                                          onClick={() => openEditNode("component", c)} 
                                          title="Edit Component"
                                          className="p-1 hover:bg-emerald-100 text-emerald-600 rounded dark:hover:bg-emerald-950"
                                        >
                                          <Edit2 className="h-3.5 w-3.5" />
                                        </button>
                                        <button 
                                          onClick={() => handleDeleteNode("component", c.id, c.name)} 
                                          title="Delete Component"
                                          className="p-1 hover:bg-red-100 text-red-600 rounded dark:hover:bg-red-950"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Component Contents */}
                                    {isComponentExpanded && (
                                      <div className="pl-6 pr-2 py-1 space-y-1.5 border-l-2 border-emerald-200 dark:border-emerald-950/50 ml-4 mt-1 pb-1">
                                        {componentCases.length === 0 ? (
                                          <p className="text-xs text-muted-foreground p-2">No test cases in this component.</p>
                                        ) : (
                                          componentCases.map((tc) => (
                                            <TestCaseRow 
                                              key={tc.id} 
                                              tc={tc} 
                                              runningTestId={runningTestId}
                                              onStartTestRun={onStartTestRun}
                                              onMove={openMoveCase}
                                              onDelete={handleDeleteTestCase}
                                              projectId={projectId}
                                            />
                                          ))
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Modals */}
      <HierarchyFormModal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        onSuccess={fetchData}
        projectId={projectId}
        level={formLevel}
        mode={formMode}
        editData={formEditData}
        parentModuleId={parentModuleId}
        parentFeatureId={parentFeatureId}
      />

      <MoveCaseModal
        isOpen={moveModalOpen}
        onClose={() => setMoveModalOpen(false)}
        onSuccess={fetchData}
        projectId={projectId}
        testCaseId={moveTestCaseId}
        testCaseTitle={moveTestCaseTitle}
        currentModuleId={moveCurrentModuleId}
        currentFeatureId={moveCurrentFeatureId}
        currentComponentId={moveCurrentComponentId}
      />

      <ConfirmDialog
        open={nodeToDelete !== null}
        title={`Delete ${nodeToDelete?.level || "Item"}`}
        description={nodeToDelete ? `Are you sure you want to delete the ${nodeToDelete.level} "${nodeToDelete.name}"? Tests inside will be kept and marked as Unassigned.` : ""}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteNode}
        onCancel={() => setNodeToDelete(null)}
      />

      <ConfirmDialog
        open={testCaseToDelete !== null}
        title="Delete Test Case"
        description={testCaseToDelete ? `Are you sure you want to delete test case "${testCaseToDelete.title}"? This action cannot be undone.` : ""}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={confirmDeleteTestCase}
        onCancel={() => setTestCaseToDelete(null)}
      />
    </div>
  )
}

interface TestCaseRowProps {
  tc: TestCase
  runningTestId: string | null
  onStartTestRun: (tcId: string) => void
  onMove: (tc: TestCase) => void
  onDelete: (tcId: string, title: string) => void
  projectId: string
}

function TestCaseRow({
  tc,
  runningTestId,
  onStartTestRun,
  onMove,
  onDelete,
  projectId
}: TestCaseRowProps) {
  const router = useRouter()
  return (
    <div className="flex items-center justify-between p-2 bg-card border rounded-lg hover:bg-accent/30 transition-all group">
      <div 
        className="flex items-center gap-2 cursor-pointer flex-1 min-w-0"
        onClick={() => router.push(`/projects/${projectId}/test-cases/${tc.id}/edit`)}
      >
        <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-sm font-medium truncate text-foreground/95">{tc.title}</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          tc.priority === "Critical" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
          tc.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" :
          tc.priority === "Medium" ? "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" :
          "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400"
        }`}>
          {tc.priority}
        </span>
        <span className="text-[10px] text-muted-foreground hidden sm:inline">
          · {tc.steps?.length || 0} steps
        </span>
      </div>

      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onMove(tc)}
          title="Move Case"
          className="p-1 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(tc.id, tc.title)}
          title="Delete Case"
          className="p-1 hover:bg-red-100 text-red-600 rounded dark:hover:bg-red-950"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
        <Button
          size="sm"
          onClick={() => onStartTestRun(tc.id)}
          disabled={runningTestId === tc.id}
          className="h-6 text-xs px-2 flex items-center gap-1 py-0"
        >
          <Play className="h-3 w-3 fill-current" />
          {runningTestId === tc.id ? "..." : "Run"}
        </Button>
      </div>
    </div>
  )
}
