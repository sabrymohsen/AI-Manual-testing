"use client"

import { useEffect, useState, useMemo, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Users,
  ShieldAlert,
  Search,
  DollarSign,
  Plus,
  Trash2,
  UserPlus,
  RefreshCw,
  CreditCard,
  ListPlus,
  TrendingUp,
  Settings,
  CheckCircle,
  Shield,
  Layers,
  Sparkles,
  Loader2,
  Pencil,
  Calendar,
  AlertTriangle,
  FolderKanban
} from "lucide-react"

interface UserListItem {
  id: string
  email: string
  name: string | null
  plan: "Free" | "Pro"
  role: "User" | "Admin"
  isActive: boolean
  trialStartedAt?: string | null
  trialEndsAt?: string | null
  createdAt: string
  _count: {
    projects: number
  }
}

interface PricingPlanItem {
  id: string
  name: string
  price: number
  billingPeriod: string
  features: string[]
  createdAt: string
}

interface TransactionItem {
  id: string
  userId: string
  amount: number
  status: string
  plan: "Free" | "Pro"
  createdAt: string
  user?: {
    email: string
    name: string | null
  }
}

type AdminTab = "users" | "pricing" | "finance" | "trial"


export default function AdminDashboardPage() {
  return (
    <Suspense fallback={
      <div className="py-24 flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="animate-spin" size={26} />
        <span className="text-xs font-semibold uppercase tracking-wide">Loading Admin Panel…</span>
      </div>
    }>
      <AdminDashboardContent />
    </Suspense>
  )
}

function AdminDashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab") as AdminTab | null
  
  const [activeTab, setActiveTab] = useState<AdminTab>("users")
  
  // Data lists
  const [users, setUsers] = useState<UserListItem[]>([])
  const [pricingPlans, setPricingPlans] = useState<PricingPlanItem[]>([])
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  
  // Trial parameters
  const [trialDays, setTrialDays] = useState(14)
  const [savingTrial, setSavingTrial] = useState(false)

  // Sync tab with URL search parameter
  useEffect(() => {
    if (tabParam && ["users", "pricing", "finance", "trial"].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  // Interactive search & filter
  const [searchQuery, setSearchQuery] = useState("")

  // Modals / forms
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUserEmail, setNewUserEmail] = useState("")
  const [newUserPassword, setNewUserPassword] = useState("")
  const [newUserName, setNewUserName] = useState("")
  const [newUserRole, setNewUserRole] = useState<"User" | "Admin">("User")
  const [newUserPlan, setNewUserPlan] = useState<"Free" | "Pro">("Free")
  const [creatingUser, setCreatingUser] = useState(false)

  const [editingUser, setEditingUser] = useState<UserListItem | null>(null)
  const [editUserEmail, setEditUserEmail] = useState("")
  const [editUserName, setEditUserName] = useState("")
  const [editUserRole, setEditUserRole] = useState<"User" | "Admin">("User")
  const [editUserPassword, setEditUserPassword] = useState("")
  const [savingUser, setSavingUser] = useState(false)

  const [showAddPlanModal, setShowAddPlanModal] = useState(false)
  const [newPlanName, setNewPlanName] = useState("")
  const [newPlanPrice, setNewPlanPrice] = useState("")
  const [newPlanPeriod, setNewPlanPeriod] = useState("monthly")
  const [newPlanFeaturesText, setNewPlanFeaturesText] = useState("")
  const [creatingPlan, setCreatingPlan] = useState(false)

  const [showSimulateTxModal, setShowSimulateTxModal] = useState(false)
  const [simTxUserId, setSimTxUserId] = useState("")
  const [simTxAmount, setSimTxAmount] = useState("")
  const [simTxPlan, setSimTxPlan] = useState<"Free" | "Pro">("Pro")
  const [simulatingTx, setSimulatingTx] = useState(false)

  // Status message
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null)

  const triggerToast = (text: string, error = false) => {
    setToast({ text, error })
    setTimeout(() => setToast(null), 3500)
  }

  // Security gate check
  useEffect(() => {
    async function verifyAdminAccess() {
      try {
        const res = await fetch("/api/me")
        if (!res.ok) {
          router.push("/dashboard")
          return
        }
        const data = await res.json()
        if (data.user.role !== "Admin") {
          router.push("/dashboard")
          return
        }
        setIsAdmin(true)
        loadDashboardData()
      } catch {
        router.push("/dashboard")
      }
    }
    verifyAdminAccess()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadDashboardData = async () => {
    setLoading(true)
    setErrorMsg(null)
    try {
      const [uRes, pRes, tRes, sRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/pricing-plans"),
        fetch("/api/admin/transactions"),
        fetch("/api/admin/settings")
      ])

      if (!uRes.ok || !pRes.ok || !tRes.ok) {
        throw new Error("One or more admin endpoints failed to load.")
      }

      const uData = await uRes.json()
      const pData = await pRes.json()
      const tData = await tRes.json()

      setUsers(uData.users || [])
      setPricingPlans(pData.plans || [])
      setTransactions(tData.transactions || [])

      if (sRes.ok) {
        const sData = await sRes.json()
        if (typeof sData.settings?.trialDays === "number") setTrialDays(sData.settings.trialDays)
      }
    } catch (err: any) {
      console.error(err)
      setErrorMsg(err.message || "Failed to load dashboard parameters.")
    } finally {
      setLoading(false)
    }
  }

  // User Actions
  const toggleUserActive = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus })
      })
      if (res.ok) {
        triggerToast(`User status toggled successfully!`)
        // Update local state
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, isActive: !currentStatus } : u))
      } else {
        triggerToast("Failed to modify user status", true)
      }
    } catch {
      triggerToast("Network error updating status", true)
    }
  }

  const changeUserPlan = async (userId: string, newPlan: "Free" | "Pro") => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: newPlan })
      })
      if (res.ok) {
        triggerToast(`User plan updated to ${newPlan}`)
        // A manual plan change clears the trial server-side; mirror that locally.
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, plan: newPlan, trialEndsAt: null } : u))
      } else {
        triggerToast("Failed to update user plan", true)
      }
    } catch {
      triggerToast("Network error updating plan", true)
    }
  }

  // Persist the default trial length (admin platform setting).
  const saveTrialSettings = async () => {
    setSavingTrial(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trialDays })
      })
      const data = await res.json()
      if (res.ok) {
        if (typeof data.settings?.trialDays === "number") setTrialDays(data.settings.trialDays)
        triggerToast(`Default trial length saved: ${data.settings?.trialDays ?? trialDays} days`)
      } else {
        triggerToast(data.error || "Failed to save trial settings", true)
      }
    } catch {
      triggerToast("Network error saving trial settings", true)
    } finally {
      setSavingTrial(false)
    }
  }

  // Extend or (re)activate a user's trial via the per-user admin endpoint.
  const runTrialAction = async (userId: string, payload: { extendDays: number } | { reactivateTrial: true }, successMsg: string) => {
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        triggerToast(successMsg)
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...data.user } : u))
      } else {
        triggerToast(data.error || "Trial update failed", true)
      }
    } catch {
      triggerToast("Network error updating trial", true)
    }
  }

  const deleteUser = async (userId: string) => {
    if (!confirm("Are you sure you want to permanently delete this user? All their projects, test cases, and runs will be cascade deleted!")) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
      if (res.ok) {
        triggerToast("User permanently deleted")
        setUsers(prev => prev.filter(u => u.id !== userId))
      } else {
        const d = await res.json()
        triggerToast(d.error || "Failed to delete user", true)
      }
    } catch {
      triggerToast("Network error deleting user", true)
    }
  }

  const openEditUser = (user: UserListItem) => {
    setEditingUser(user)
    setEditUserEmail(user.email)
    setEditUserName(user.name || "")
    setEditUserRole(user.role)
    setEditUserPassword("")
  }

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setSavingUser(true)
    try {
      const payload: Record<string, string> = {}
      if (editUserEmail !== editingUser.email) payload.email = editUserEmail
      if (editUserName !== (editingUser.name || "")) payload.name = editUserName
      if (editUserRole !== editingUser.role) payload.role = editUserRole
      if (editUserPassword) payload.password = editUserPassword

      if (Object.keys(payload).length === 0) {
        setEditingUser(null)
        return
      }

      const res = await fetch(`/api/admin/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (res.ok) {
        triggerToast("User info updated successfully!")
        setUsers(prev => prev.map(u => u.id === editingUser.id ? { ...u, ...data.user } : u))
        setEditingUser(null)
      } else {
        triggerToast(data.error || "Failed to update user info", true)
      }
    } catch {
      triggerToast("Network error updating user info", true)
    } finally {
      setSavingUser(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUserEmail || !newUserPassword) return
    setCreatingUser(true)
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newUserEmail,
          password: newUserPassword,
          name: newUserName || null,
          plan: newUserPlan,
          role: newUserRole
        })
      })
      const data = await res.json()
      if (res.ok) {
        triggerToast("New user created successfully!")
        setNewUserEmail("")
        setNewUserPassword("")
        setNewUserName("")
        setShowAddUserModal(false)
        loadDashboardData()
      } else {
        triggerToast(data.error || "Failed to create user", true)
      }
    } catch {
      triggerToast("Network error creating user", true)
    } finally {
      setCreatingUser(false)
    }
  }

  // Pricing Actions
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPlanName || !newPlanPrice) return
    setCreatingPlan(true)
    try {
      const features = newPlanFeaturesText.split("\n").map(f => f.trim()).filter(Boolean)
      const res = await fetch("/api/admin/pricing-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newPlanName,
          price: parseFloat(newPlanPrice),
          billingPeriod: newPlanPeriod,
          features
        })
      })
      const data = await res.json()
      if (res.ok) {
        triggerToast("Pricing plan tier added!")
        setNewPlanName("")
        setNewPlanPrice("")
        setNewPlanFeaturesText("")
        setShowAddPlanModal(false)
        loadDashboardData()
      } else {
        triggerToast(data.error || "Failed to create plan", true)
      }
    } catch {
      triggerToast("Network error adding plan", true)
    } finally {
      setCreatingPlan(false)
    }
  }

  const deletePlan = async (planId: string) => {
    if (!confirm("Remove this pricing plan?")) return
    try {
      const res = await fetch(`/api/admin/pricing-plans/${planId}`, { method: "DELETE" })
      if (res.ok) {
        triggerToast("Pricing plan removed")
        setPricingPlans(prev => prev.filter(p => p.id !== planId))
      } else {
        triggerToast("Failed to remove plan", true)
      }
    } catch {
      triggerToast("Network error removing plan", true)
    }
  }

  // Finance Simulation Actions
  const handleSimulateTx = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!simTxUserId || !simTxAmount) return
    setSimulatingTx(true)
    try {
      const res = await fetch("/api/admin/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: simTxUserId,
          amount: parseFloat(simTxAmount),
          plan: simTxPlan,
          status: "Success"
        })
      })
      const data = await res.json()
      if (res.ok) {
        triggerToast("Payment simulated and plan upgraded!")
        setSimTxAmount("")
        setShowSimulateTxModal(false)
        loadDashboardData()
      } else {
        triggerToast(data.error || "Simulation failed", true)
      }
    } catch {
      triggerToast("Network error simulating payment", true)
    } finally {
      setSimulatingTx(false)
    }
  }

  // Statistics computations
  const stats = useMemo(() => {
    const totalUsers = users.length
    const activeUsers = users.filter(u => u.isActive).length
    const deactivatedUsers = totalUsers - activeUsers
    const totalRevenue = transactions
      .filter(t => t.status === "Success")
      .reduce((sum, t) => sum + t.amount, 0)

    const proUsers = users.filter(u => u.plan === "Pro").length
    const freeUsers = totalUsers - proUsers

    return {
      totalUsers,
      activeUsers,
      deactivatedUsers,
      totalRevenue,
      proUsers,
      freeUsers
    }
  }, [users, transactions])

  // Filters search query
  const filteredUsers = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return users.filter(u => 
      u.email.toLowerCase().includes(q) || 
      (u.name && u.name.toLowerCase().includes(q))
    )
  }, [users, searchQuery])

  // Users who have (or had) a trial window, respecting the search filter.
  const trialUsers = useMemo(() => {
    return filteredUsers.filter((u) => u.role !== "Admin" && !!u.trialEndsAt)
  }, [filteredUsers])

  const filteredTransactions = useMemo(() => {
    const q = searchQuery.toLowerCase()
    return transactions.filter(t => 
      t.user?.email.toLowerCase().includes(q) || 
      (t.user?.name && t.user.name.toLowerCase().includes(q))
    )
  }, [transactions, searchQuery])

  if (!isAdmin) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 bg-slate-950 min-h-screen text-slate-400">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
        <p className="text-xs font-semibold uppercase tracking-wider">Verifying administrator credentials...</p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 text-slate-800 dark:text-slate-100">
      
      {/* Title Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2">
            <Shield className="text-indigo-650 animate-pulse h-6 w-6" /> System Administration
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Manage system users, activate/deactivate nodes, edit price lists, and review simulation billing statements.
          </p>
        </div>
        <Button
          onClick={loadDashboardData}
          variant="outline"
          className="h-9 border-slate-200 text-xs font-bold flex items-center gap-1.5 rounded-xl hover:bg-slate-50 shadow-xs"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} /> Refresh Panel
        </Button>
      </div>

      {/* Metrics Row */}
      {!loading && !errorMsg && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Users */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-450 tracking-wider">Total Users</span>
              <h3 className="text-2xl font-extrabold text-slate-900">{stats.totalUsers}</h3>
              <p className="text-[10px] text-slate-400">{stats.proUsers} Pro · {stats.freeUsers} Free</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Users size={18} />
            </div>
          </div>

          {/* Active Accounts */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-455 tracking-wider">Active vs Blocked</span>
              <h3 className="text-2xl font-extrabold text-emerald-600">{stats.activeUsers} <span className="text-xs text-slate-400 font-semibold">active</span></h3>
              <p className="text-[10px] text-slate-400">{stats.deactivatedUsers} deactivated accounts</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle size={18} />
            </div>
          </div>

          {/* Total Revenue */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-455 tracking-wider">System Billing</span>
              <h3 className="text-2xl font-extrabold text-indigo-650">${stats.totalRevenue.toFixed(2)}</h3>
              <p className="text-[10px] text-slate-400">{transactions.length} processed invoices</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp size={18} />
            </div>
          </div>

          {/* Pricing tiers */}
          <div className="bg-white border border-slate-150 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-455 tracking-wider">Pricing Plans</span>
              <h3 className="text-2xl font-extrabold text-slate-900">{pricingPlans.length}</h3>
              <p className="text-[10px] text-slate-400">Tiers on pricing list</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <CreditCard size={18} />
            </div>
          </div>
        </div>
      )}

      {/* Navigation Sub-Tabs */}
      <div className="bg-slate-100/50 p-1.5 rounded-xl flex items-center justify-between gap-2 flex-wrap border">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "users"
                ? "bg-white text-indigo-700 shadow-xs border"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Users size={14} /> Users Management
          </button>
          <button
            onClick={() => setActiveTab("pricing")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "pricing"
                ? "bg-white text-indigo-700 shadow-xs border"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <CreditCard size={14} /> Pricing & Plans
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "finance"
                ? "bg-white text-indigo-700 shadow-xs border"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <DollarSign size={14} /> Finance & Invoices
          </button>
          <button
            onClick={() => setActiveTab("trial")}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "trial"
                ? "bg-white text-indigo-700 shadow-xs border"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <Sparkles size={14} /> Free Trial
          </button>
        </div>

        {/* Global actions based on selected tab */}
        <div>
          {activeTab === "users" && (
            <Button
              onClick={() => setShowAddUserModal(true)}
              className="h-8.5 text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white flex items-center gap-1.5 rounded-xl shadow-xs"
            >
              <UserPlus size={13} /> Add User
            </Button>
          )}
          {activeTab === "pricing" && (
            <Button
              onClick={() => setShowAddPlanModal(true)}
              className="h-8.5 text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white flex items-center gap-1.5 rounded-xl shadow-xs"
            >
              <ListPlus size={13} /> Add Price Tier
            </Button>
          )}
          {activeTab === "finance" && (
            <Button
              onClick={() => setShowSimulateTxModal(true)}
              className="h-8.5 text-xs font-bold bg-indigo-650 hover:bg-indigo-700 text-white flex items-center gap-1.5 rounded-xl shadow-xs"
            >
              <CreditCard size={13} /> Simulate Payment
            </Button>
          )}
        </div>
      </div>

      {/* Search Filter Bar */}
      {!loading && !errorMsg && activeTab !== "pricing" && (
        <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xs border">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={activeTab === "users" || activeTab === "trial" ? "Search users by name/email..." : "Search transactions..."}
            className="w-full h-9 pl-9 pr-3 rounded-xl border-none focus:outline-none text-xs focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Main Panel Content Area */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 border bg-white rounded-2xl">
          <Loader2 size={32} className="animate-spin text-indigo-600" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Loading dashboard datasets...</p>
        </div>
      ) : errorMsg ? (
        <div className="py-16 text-center border border-rose-100 bg-rose-50/20 rounded-2xl flex flex-col items-center justify-center p-6 space-y-4 max-w-2xl mx-auto">
          <ShieldAlert size={40} className="text-rose-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Admin API Load Failed</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">{errorMsg}</p>
          </div>
          <Button onClick={loadDashboardData} className="bg-rose-600 text-white hover:bg-rose-700 text-xs font-semibold flex items-center gap-1">
            <RefreshCw size={12} /> Retry
          </Button>
        </div>
      ) : (
        <>
          {/* ---- TAB: USERS ---- */}
          {activeTab === "users" && (
            <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-4 w-12 text-center">#</th>
                      <th className="p-4">User Email</th>
                      <th className="p-4">Display Name</th>
                      <th className="p-4">Plan Plan</th>
                      <th className="p-4">System Role</th>
                      <th className="p-4 text-center">Projects</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650">
                    {filteredUsers.map((user, idx) => (
                      <tr key={user.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-4 text-center text-slate-350 font-bold">{idx + 1}</td>
                        <td className="p-4 font-bold text-slate-900 select-all">{user.email}</td>
                        <td className="p-4">{user.name || <span className="text-slate-300 italic">None</span>}</td>
                        <td className="p-4">
                          <select
                            value={user.plan}
                            onChange={(e) => changeUserPlan(user.id, e.target.value as "Free" | "Pro")}
                            className="bg-slate-100 hover:bg-slate-200 border-none rounded px-2 py-0.5 text-[10px] font-black text-indigo-700 cursor-pointer"
                          >
                            <option value="Free">Free</option>
                            <option value="Pro">Pro</option>
                          </select>
                        </td>
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                            user.role === "Admin" ? "bg-red-50 text-red-700 border-red-100" : "bg-slate-50 text-slate-650 border-slate-200"
                          }`}>
                            {user.role}
                          </span>
                        </td>
                        <td className="p-4 text-center font-black text-slate-700">{user._count.projects}</td>
                        <td className="p-4">
                          <button
                            onClick={() => toggleUserActive(user.id, user.isActive)}
                            className={`px-2 py-0.5 rounded text-[10px] font-black border transition-all ${
                              user.isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                : "bg-rose-50 text-rose-700 border-rose-100 animate-pulse"
                            }`}
                          >
                            {user.isActive ? "Active" : "Deactivated"}
                          </button>
                        </td>
                        <td className="p-4 text-right space-x-1">
                          <Button
                            variant="ghost"
                            onClick={() => openEditUser(user)}
                            className="h-7 w-7 p-0 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 rounded-lg"
                            title="Edit user info"
                          >
                            <Pencil size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => deleteUser(user.id)}
                            className="h-7 w-7 p-0 hover:bg-rose-50 text-red-650 rounded-lg"
                            title="Delete user data"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ---- TAB: PRICING ---- */}
          {activeTab === "pricing" && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pricingPlans.map((plan) => (
                <div key={plan.id} className="bg-white border rounded-2xl p-5 shadow-sm space-y-4 relative overflow-hidden flex flex-col justify-between hover:shadow-md transition-all">
                  <button 
                    onClick={() => deletePlan(plan.id)}
                    className="absolute top-4 right-4 text-slate-350 hover:text-red-650 transition-colors p-1 hover:bg-slate-50 rounded"
                  >
                    <Trash2 size={14} />
                  </button>

                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-indigo-650 tracking-wider bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                      {plan.billingPeriod} price list
                    </span>
                    <h3 className="text-base font-black text-slate-900">{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">${plan.price.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">/ {plan.billingPeriod}</span>
                    </div>
                  </div>

                  <div className="border-t pt-4 flex-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Features Included</p>
                    <ul className="space-y-1.5">
                      {plan.features.map((feat, fidx) => (
                        <li key={fidx} className="flex items-start gap-1.5 text-xs text-slate-600">
                          <CheckCircle size={13} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                      {plan.features.length === 0 && (
                        <li className="text-slate-400 italic text-[11px]">No features listed.</li>
                      )}
                    </ul>
                  </div>

                  <p className="text-[9px] text-slate-400 font-semibold flex items-center gap-1 pt-2">
                    <Calendar size={11} /> Created {new Date(plan.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}

              {pricingPlans.length === 0 && (
                <div className="col-span-3 py-16 text-center border border-dashed rounded-2xl bg-slate-50/10 p-6">
                  <CreditCard size={32} className="mx-auto text-slate-350" />
                  <p className="text-sm font-bold text-slate-600 mt-3">No pricing plans created yet.</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    Click "Add Price Tier" to populate pricing list options.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---- TAB: FINANCE ---- */}
          {activeTab === "finance" && (
            <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-4 w-12 text-center">#</th>
                      <th className="p-4">Transaction ID</th>
                      <th className="p-4">User Email</th>
                      <th className="p-4">Plan Tier</th>
                      <th className="p-4">Amount Paid</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Processed Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-650">
                    {filteredTransactions.map((tx, idx) => (
                      <tr key={tx.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="p-4 text-center text-slate-350 font-bold">{idx + 1}</td>
                        <td className="p-4 font-mono font-bold text-slate-500 select-all">{tx.id}</td>
                        <td className="p-4 font-bold text-slate-900 select-all">{tx.user?.email || "Unknown User"}</td>
                        <td className="p-4">
                          <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black border border-indigo-150">
                            {tx.plan}
                          </span>
                        </td>
                        <td className="p-4 font-extrabold text-slate-900">${tx.amount.toFixed(2)}</td>
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                            tx.status === "Success" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-red-50 text-red-705 border-red-100"
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-slate-450">{new Date(tx.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                    {filteredTransactions.length === 0 && (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-slate-400 italic">No processed transaction history available.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {/* ---- TAB: TRIAL ---- */}
          {activeTab === "trial" && (
            <div className="space-y-6">
              
              {/* Trial Configuration Settings */}
              <div className="bg-white border rounded-2xl p-5 shadow-sm space-y-4 max-w-2xl">
                <h3 className="text-base font-black text-slate-900 flex items-center gap-1.5">
                  <Sparkles size={16} className="text-indigo-600" /> Default Trial Duration
                </h3>
                <p className="text-xs text-slate-500">
                  Configure the default free trial length allocated to all new users upon registration. Users will have restricted access once their trial period expires.
                </p>
                <div className="flex items-center gap-3 max-w-xs pt-1">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      value={trialDays}
                      onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
                      className="w-full h-9 px-3 pr-10 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500 font-bold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-black uppercase">Days</span>
                  </div>
                  <Button
                    onClick={saveTrialSettings}
                    disabled={savingTrial}
                    className="bg-indigo-600 text-white hover:bg-indigo-700 text-xs font-bold rounded-xl h-9"
                  >
                    {savingTrial ? "Saving..." : "Save Settings"}
                  </Button>
                </div>
              </div>

              {/* Trial Users List Table */}
              <div className="bg-white border rounded-2xl overflow-hidden shadow-xs">
                <div className="p-4 border-b">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">Active Trial Accounts</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <th className="p-4 w-12 text-center">#</th>
                        <th className="p-4">User Email</th>
                        <th className="p-4">Registered Date</th>
                        <th className="p-4">Trial Length</th>
                        <th className="p-4 text-center">Remaining Days</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-slate-650">
                      {trialUsers.map((user, idx) => {
                          const regDate = new Date(user.createdAt)
                          const endsAt = user.trialEndsAt ? new Date(user.trialEndsAt) : null
                          const startedAt = user.trialStartedAt ? new Date(user.trialStartedAt) : null
                          const remainingMs = endsAt ? endsAt.getTime() - Date.now() : 0
                          const remaining = remainingMs > 0 ? Math.ceil(remainingMs / (1000 * 60 * 60 * 24)) : 0
                          const isExpired = remaining <= 0
                          const lengthDays = startedAt && endsAt
                            ? Math.max(1, Math.round((endsAt.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)))
                            : null

                          return (
                            <tr key={user.id} className="hover:bg-slate-50/30 transition-colors">
                              <td className="p-4 text-center text-slate-350 font-bold">{idx + 1}</td>
                              <td className="p-4 font-bold text-slate-900 select-all">{user.email}</td>
                              <td className="p-4 font-semibold text-slate-450">{regDate.toLocaleDateString()}</td>
                              <td className="p-4 font-semibold text-slate-500">{lengthDays ? `${lengthDays} Days` : "—"}</td>
                              <td className="p-4 text-center font-black text-slate-700">
                                {isExpired ? (
                                  <span className="text-rose-600">Expired</span>
                                ) : (
                                  <span>{remaining} Days</span>
                                )}
                              </td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black border ${
                                  !isExpired
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100 animate-pulse"
                                    : "bg-rose-50 text-rose-700 border-rose-100"
                                }`}>
                                  {!isExpired ? "In Trial" : "Expired Trial"}
                                </span>
                              </td>
                              <td className="p-4 text-right space-x-1.5">
                                {!isExpired ? (
                                  <Button
                                    variant="outline"
                                    onClick={() => runTrialAction(user.id, { extendDays: 7 }, `Trial extended by 7 days for ${user.email}`)}
                                    className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                                  >
                                    Extend +7d
                                  </Button>
                                ) : (
                                  <Button
                                    variant="outline"
                                    onClick={() => runTrialAction(user.id, { reactivateTrial: true }, `Trial reactivated for ${user.email}`)}
                                    className="h-7 text-[10px] font-bold border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"
                                  >
                                    Reactivate
                                  </Button>
                                )}
                                <Button
                                  onClick={() => changeUserPlan(user.id, "Pro")}
                                  className="h-7 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                                  title="Grant paid Pro (clears the trial)"
                                >
                                  Activate Pro
                                </Button>
                              </td>
                            </tr>
                          )
                        })}
                      {trialUsers.length === 0 && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 italic">No users currently or previously on a free trial.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}
        </>
      )}

      {/* ---- MODAL: ADD USER ---- */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-black text-slate-900">Create New System User</h3>
            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase">Email Address</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">Password</label>
                <input
                  type="password"
                  required
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">Display Name</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">System Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as "User" | "Admin")}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                  >
                    <option value="User">User</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">User Plan</label>
                  <select
                    value={newUserPlan}
                    onChange={(e) => setNewUserPlan(e.target.value as "Free" | "Pro")}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                  >
                    <option value="Free">Free</option>
                    <option value="Pro">Pro</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowAddUserModal(false)}>Cancel</Button>
                <Button type="submit" disabled={creatingUser} className="bg-indigo-650 text-white hover:bg-indigo-700">
                  {creatingUser ? <Loader2 size={13} className="animate-spin" /> : "Create User"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- MODAL: EDIT USER ---- */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-black text-slate-900">Edit User Info</h3>
            <form onSubmit={handleEditUser} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase">Email Address</label>
                <input
                  type="email"
                  required
                  value={editUserEmail}
                  onChange={(e) => setEditUserEmail(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">Display Name</label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">System Role</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value as "User" | "Admin")}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                >
                  <option value="User">User</option>
                  <option value="Admin">Admin</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">New Password (leave blank to keep current)</label>
                <input
                  type="password"
                  minLength={6}
                  placeholder="••••••••"
                  value={editUserPassword}
                  onChange={(e) => setEditUserPassword(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setEditingUser(null)}>Cancel</Button>
                <Button type="submit" disabled={savingUser} className="bg-indigo-650 text-white hover:bg-indigo-700">
                  {savingUser ? <Loader2 size={13} className="animate-spin" /> : "Save Changes"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- MODAL: ADD PLAN ---- */}
      {showAddPlanModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-black text-slate-900">Add New Pricing Plan Tier</h3>
            <form onSubmit={handleCreatePlan} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase">Tier Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pro Suite, Developer Plan"
                  value={newPlanName}
                  onChange={(e) => setNewPlanName(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 49.00"
                    value={newPlanPrice}
                    onChange={(e) => setNewPlanPrice(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">Billing Period</label>
                  <select
                    value={newPlanPeriod}
                    onChange={(e) => setNewPlanPeriod(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-455 uppercase">Bullet Features (One per line)</label>
                <textarea
                  placeholder="Unlimited active projects&#10;Smart locator auto-healing&#10;BullMQ worker integration"
                  rows={4}
                  value={newPlanFeaturesText}
                  onChange={(e) => setNewPlanFeaturesText(e.target.value)}
                  className="w-full p-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowAddPlanModal(false)}>Cancel</Button>
                <Button type="submit" disabled={creatingPlan} className="bg-indigo-650 text-white hover:bg-indigo-700">
                  {creatingPlan ? <Loader2 size={13} className="animate-spin" /> : "Save Pricing Tier"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---- MODAL: SIMULATE TRANSACTION ---- */}
      {showSimulateTxModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-3xl border shadow-2xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-base font-black text-slate-900">Simulate Payment & Plan Upgrade</h3>
            <form onSubmit={handleSimulateTx} className="space-y-4 text-xs font-semibold">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-450 uppercase">Select Target User</label>
                <select
                  required
                  value={simTxUserId}
                  onChange={(e) => setSimTxUserId(e.target.value)}
                  className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                >
                  <option value="">-- Choose User --</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.email} ({u.name || "No name"})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">Paid Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="e.g. 99.00"
                    value={simTxAmount}
                    onChange={(e) => setSimTxAmount(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-455 uppercase">Upgrade Plan To</label>
                  <select
                    value={simTxPlan}
                    onChange={(e) => setSimTxPlan(e.target.value as "Free" | "Pro")}
                    className="w-full h-9 px-3 rounded-xl border border-slate-200 text-xs bg-slate-50 cursor-pointer"
                  >
                    <option value="Free">Free</option>
                    <option value="Pro">Pro</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button type="button" variant="ghost" onClick={() => setShowSimulateTxModal(false)}>Cancel</Button>
                <Button type="submit" disabled={simulatingTx} className="bg-indigo-650 text-white hover:bg-indigo-700">
                  {simulatingTx ? <Loader2 size={13} className="animate-spin" /> : "Process simulated payment"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast Popup */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-2xl shadow-xl text-xs font-bold text-white border animate-fade-in-up flex items-center gap-2 ${
            toast.error ? "bg-rose-600 border-rose-500" : "bg-slate-900 border-slate-800"
          }`}
        >
          {toast.error ? <AlertTriangle size={14} /> : <CheckCircle size={14} />}
          <span>{toast.text}</span>
        </div>
      )}

    </div>
  )
}
