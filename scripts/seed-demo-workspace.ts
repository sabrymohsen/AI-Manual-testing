/**
 * Seeds a realistic multi-project demo workspace so the project switcher, the
 * Scrum board (user stories) and the BRD Hub all have data to exercise.
 *
 * Creates THREE projects, each with board columns, sprints, epics, user
 * stories (Task) and BRD documents backed by REAL .pdf / .docx files on disk
 * (so preview, version history and download all work).
 *
 * Idempotent: it resets ONLY the three demo projects listed in PROJECTS and
 * recreates them. Every other project is left untouched.
 *
 *   Run:  npx tsx scripts/seed-demo-workspace.ts
 *
 * Ownership: the projects are owned by DEMO_OWNER_EMAIL (default
 * sabrymohsen94@gmail.com) so they show up in the sidebar switcher when you
 * log in as yourself; the global admin is added as a project Admin member.
 */
import {
  PrismaClient,
  TaskStatus,
  TaskPriority,
  TaskType,
  ScrumSprintStatus,
} from "@prisma/client"
import bcrypt from "bcryptjs"
import { mkdir, writeFile, rm } from "fs/promises"
import path from "path"
import { jsPDF } from "jspdf"
import { Document, Packer, Paragraph, HeadingLevel, TextRun, Table, TableRow, TableCell, WidthType } from "docx"

const prisma = new PrismaClient()

const STORAGE_ROOT = process.env.STORAGE_ROOT || "./storage"
const OWNER_EMAIL = process.env.DEMO_OWNER_EMAIL || "sabrymohsen94@gmail.com"
const ADMIN_EMAIL = "admin@example.com"

const d = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000)

// ─────────────────────────────────────────────────────────────────────────────
// Team (shared across the three demo projects)
// ─────────────────────────────────────────────────────────────────────────────

const TEAM = [
  { id: "demo-u1", email: "layla@qaengine.dev", name: "Layla Hassan", avatarUrl: "https://i.pravatar.cc/128?img=24", role: "admin" },
  { id: "demo-u2", email: "omar@qaengine.dev", name: "Omar Farouk", avatarUrl: "https://i.pravatar.cc/128?img=60", role: "manager" },
  { id: "demo-u3", email: "chen@qaengine.dev", name: "Chen Wei", avatarUrl: "https://i.pravatar.cc/128?img=15", role: "member" },
  { id: "demo-u4", email: "mariam@qaengine.dev", name: "Mariam Saleh", avatarUrl: "https://i.pravatar.cc/128?img=45", role: "member" },
  { id: "demo-u5", email: "tom@qaengine.dev", name: "Tom Becker", avatarUrl: "https://i.pravatar.cc/128?img=52", role: "member" },
]

const COLUMNS = [
  { name: "Backlog", status: TaskStatus.TODO, order: 0, wipLimit: null as number | null },
  { name: "In Progress", status: TaskStatus.IN_PROGRESS, order: 1, wipLimit: 4 },
  { name: "In Review", status: TaskStatus.REVIEW, order: 2, wipLimit: 3 },
  { name: "Testing", status: TaskStatus.TESTING, order: 3, wipLimit: 3 },
  { name: "Done", status: TaskStatus.DONE, order: 4, wipLimit: null },
]

// ─────────────────────────────────────────────────────────────────────────────
// Seed shapes
// ─────────────────────────────────────────────────────────────────────────────

type SeedStory = {
  title: string
  description: string
  type?: TaskType
  status: TaskStatus
  priority: TaskPriority
  storyPoints: number
  progress: number
  epic: string // epic key within the project
  sprint: "active" | "next" | "past" | null // null = product backlog
  assignees: string[]
  labels: string[]
  components?: string[]
  subtasks?: { title: string; completed: boolean }[]
  comments?: { authorId: string; content: string }[]
  dueDate?: Date
}

type SeedBrdSection = { heading: string; body: string[]; bullets?: string[] }

type SeedBrd = {
  key: string
  name: string
  filename: string
  fileType: "pdf" | "docx"
  status: "Draft" | "Reviewed" | "Final" | "Archived"
  sections: SeedBrdSection[]
  // Extra revisions beyond v1. Each becomes its own BrdVersion + file.
  revisions?: { changeSummary: string; editor: string; addSection?: SeedBrdSection }[]
  linkEpics: string[] // epic keys
  linkStories: string[] // story title prefixes (matched startsWith)
  annotations?: {
    type: "comment" | "highlight" | "sticky"
    page?: number
    text: string
    quote?: string
    author: string
    resolved?: boolean
    replies?: { text: string; author: string }[]
  }[]
}

type SeedProject = {
  id: string
  name: string
  boardKey: string
  webAppUrl: string
  description: string
  environment: "Dev" | "Staging" | "UAT" | "Production"
  epics: { key: string; title: string; description: string; color: string }[]
  sprints: {
    key: "active" | "next" | "past"
    name: string
    goal: string
    status: ScrumSprintStatus
    startDate: Date
    endDate: Date
  }[]
  stories: SeedStory[]
  brds: SeedBrd[]
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT 1 — ShopFront Commerce
// ─────────────────────────────────────────────────────────────────────────────

const SHOPFRONT: SeedProject = {
  id: "demo-proj-shopfront",
  name: "ShopFront Commerce",
  boardKey: "SHOP",
  webAppUrl: "https://shopfront.example.com",
  description: "Customer-facing storefront: catalogue, cart, checkout and order tracking.",
  environment: "Production",
  epics: [
    { key: "checkout", title: "Checkout & Payments", description: "Cart, payment methods, order confirmation.", color: "#2563eb" },
    { key: "catalog", title: "Catalogue & Search", description: "Product discovery, filters, recommendations.", color: "#7c3aed" },
    { key: "account", title: "Customer Account", description: "Profiles, addresses, order history, returns.", color: "#059669" },
  ],
  sprints: [
    { key: "past", name: "Sprint 11 — Search Revamp", goal: "Ship faceted search and the new PDP layout.", status: ScrumSprintStatus.COMPLETED, startDate: d(-28), endDate: d(-14) },
    { key: "active", name: "Sprint 12 — One-Page Checkout", goal: "Cut checkout drop-off by shipping the one-page flow and wallet payments.", status: ScrumSprintStatus.ACTIVE, startDate: d(-6), endDate: d(8) },
    { key: "next", name: "Sprint 13 — Returns Self-Service", goal: "Let customers open and track returns without contacting support.", status: ScrumSprintStatus.PLANNED, startDate: d(9), endDate: d(23) },
  ],
  stories: [
    {
      title: "As a shopper I can complete checkout on a single page",
      description: "Collapse the four-step checkout into one page with inline validation so shoppers never lose context. Address, delivery and payment sections stay visible and expand in place.",
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGHEST, storyPoints: 8, progress: 55,
      epic: "checkout", sprint: "active", assignees: ["demo-u1", "demo-u3"], labels: ["checkout", "conversion"],
      components: ["storefront", "payments"], dueDate: d(5),
      subtasks: [
        { title: "Single-page layout shell", completed: true },
        { title: "Inline address validation", completed: true },
        { title: "Payment section state machine", completed: false },
        { title: "Analytics events per section", completed: false },
      ],
      comments: [
        { authorId: "demo-u1", content: "Design signed off. Watch the mobile keyboard pushing the pay button off-screen." },
        { authorId: "demo-u3", content: "Address autocomplete is behind a feature flag until the provider contract is signed." },
      ],
    },
    {
      title: "As a shopper I can pay with Apple Pay and Google Pay",
      description: "Add wallet payment buttons above the card form, with the same order-confirmation flow and a graceful fallback when the wallet is unavailable.",
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, storyPoints: 5, progress: 30,
      epic: "checkout", sprint: "active", assignees: ["demo-u3"], labels: ["payments", "mobile"],
      components: ["payments"], dueDate: d(7),
      subtasks: [
        { title: "Merchant registration + domain verification", completed: true },
        { title: "Wallet button component", completed: false },
        { title: "Sandbox end-to-end test", completed: false },
      ],
      comments: [{ authorId: "demo-u2", content: "Finance needs the settlement report format before we go live." }],
    },
    {
      title: "As a shopper I see delivery estimates before I pay",
      description: "Show a per-item delivery estimate in the cart and checkout summary, sourced from the fulfilment service and cached for five minutes.",
      status: TaskStatus.REVIEW, priority: TaskPriority.MEDIUM, storyPoints: 3, progress: 85,
      epic: "checkout", sprint: "active", assignees: ["demo-u4"], labels: ["fulfilment"],
      subtasks: [{ title: "Estimate API client", completed: true }, { title: "Cart + checkout UI", completed: true }],
      comments: [{ authorId: "demo-u4", content: "Estimates are timezone-correct now — was showing next-day for late orders." }],
    },
    {
      title: "As a shopper I can save my card for next time",
      description: "Tokenise the card at checkout and offer it on the next order, with a clear consent checkbox and a way to remove saved cards from the account page.",
      status: TaskStatus.TESTING, priority: TaskPriority.HIGH, storyPoints: 5, progress: 90,
      epic: "checkout", sprint: "active", assignees: ["demo-u5"], labels: ["payments", "security"],
      subtasks: [{ title: "Vault integration", completed: true }, { title: "Consent copy review", completed: true }, { title: "Remove-card flow", completed: true }],
      comments: [{ authorId: "demo-u5", content: "Pen-test ticket raised for the tokenisation endpoint — nothing blocking." }],
    },
    {
      title: "As a shopper I can filter search results by brand and price",
      description: "Faceted filters on the search results page with counts, multi-select, and shareable URLs that preserve the applied facets.",
      status: TaskStatus.DONE, priority: TaskPriority.HIGH, storyPoints: 8, progress: 100,
      epic: "catalog", sprint: "past", assignees: ["demo-u2", "demo-u4"], labels: ["search"],
      subtasks: [{ title: "Facet aggregation query", completed: true }, { title: "Filter sidebar", completed: true }, { title: "URL state sync", completed: true }],
      comments: [{ authorId: "demo-u2", content: "Shipped. Search-to-cart improved 11% week over week." }],
    },
    {
      title: "As a shopper I see related products on the product page",
      description: "Recommendation strip under the product description driven by co-purchase data, falling back to same-category best sellers.",
      status: TaskStatus.DONE, priority: TaskPriority.MEDIUM, storyPoints: 5, progress: 100,
      epic: "catalog", sprint: "past", assignees: ["demo-u4"], labels: ["search", "growth"],
      subtasks: [{ title: "Recommendation endpoint", completed: true }, { title: "Carousel component", completed: true }],
    },
    {
      title: "As a customer I can open a return from my order history",
      description: "Self-service returns: pick items, choose a reason, print a label and track the refund status without contacting support.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGH, storyPoints: 13, progress: 0,
      epic: "account", sprint: "next", assignees: ["demo-u1"], labels: ["returns", "support"],
      subtasks: [{ title: "Returns eligibility rules", completed: false }, { title: "Label generation", completed: false }, { title: "Refund status timeline", completed: false }],
      comments: [{ authorId: "demo-u1", content: "Blocked on the carrier API credentials — chased twice." }],
    },
    {
      title: "As a customer I can manage multiple delivery addresses",
      description: "Add, edit, delete and set a default address, with validation against the postal-code service.",
      status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, storyPoints: 5, progress: 0,
      epic: "account", sprint: "next", assignees: ["demo-u5"], labels: ["account"],
      subtasks: [{ title: "Address book CRUD", completed: false }, { title: "Default address rules", completed: false }],
    },
    {
      title: "As a customer I get an email when my order ships",
      description: "Transactional shipping email with the tracking link, item list and delivery estimate, localised to the customer's language.",
      status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, storyPoints: 3, progress: 0,
      epic: "account", sprint: null, assignees: [], labels: ["notifications"],
    },
    {
      title: "As a shopper I can check out as a guest",
      description: "Allow checkout without an account, with an optional account creation prompt on the confirmation page.",
      status: TaskStatus.TODO, priority: TaskPriority.LOW, storyPoints: 5, progress: 0,
      epic: "checkout", sprint: "active", assignees: ["demo-u2"], labels: ["checkout", "conversion"],
      subtasks: [{ title: "Guest order lookup by email", completed: false }],
    },
    {
      title: "Cart total is wrong when a promo code is removed",
      description: "Removing a promo code leaves the discount applied to the order total until the page is refreshed. Reproduced on staging with code SUMMER20.",
      type: TaskType.BUG,
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGHEST, storyPoints: 2, progress: 40,
      epic: "checkout", sprint: "active", assignees: ["demo-u3"], labels: ["bug", "checkout"],
      comments: [{ authorId: "demo-u3", content: "Cart totals are recalculated server-side but the client keeps a stale discount object." }],
    },
  ],
  brds: [
    {
      key: "checkout-brd",
      name: "BRD — One-Page Checkout",
      filename: "BRD-OnePage-Checkout.docx",
      fileType: "docx",
      status: "Final",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "This Business Requirements Document defines the scope, rules and acceptance criteria for replacing the four-step ShopFront checkout with a single-page checkout experience.",
            "The current funnel loses 38% of shoppers between the delivery step and the payment step. The one-page flow keeps every section visible so shoppers can review and correct details without navigating backwards.",
          ],
        },
        {
          heading: "2. Business Objectives",
          body: ["The initiative is measured against the following outcomes over the first full quarter after release."],
          bullets: [
            "Reduce checkout abandonment from 38% to at most 27%.",
            "Increase mobile conversion rate by at least 8% relative.",
            "Reduce checkout-related support contacts by 20%.",
            "Keep median checkout completion time under 90 seconds.",
          ],
        },
        {
          heading: "3. Scope",
          body: [
            "In scope: cart review, delivery address capture, delivery method selection, payment capture (card and wallet), promo codes and order confirmation.",
            "Out of scope: the returns experience, subscription billing, and the B2B quote flow. These are covered by separate BRDs.",
          ],
        },
        {
          heading: "4. Functional Requirements",
          body: ["Each requirement below is traceable to at least one user story on the SHOP board."],
          bullets: [
            "FR-01 All checkout sections render on a single route with no full page reloads between sections.",
            "FR-02 Field validation is inline and runs on blur; the pay button stays disabled until every required field is valid.",
            "FR-03 Registered customers see their default address pre-filled and editable in place.",
            "FR-04 Wallet payment options appear above the card form only when the device and browser support them.",
            "FR-05 A per-item delivery estimate is displayed in the order summary before payment is taken.",
            "FR-06 Promo code add and remove recalculates the order total server-side; the client never derives totals locally.",
            "FR-07 On payment failure the shopper stays on the page with all entered data preserved.",
          ],
        },
        {
          heading: "5. Non-Functional Requirements",
          bullets: [
            "NFR-01 Largest Contentful Paint under 2.0s on a mid-tier mobile device over 4G.",
            "NFR-02 PCI DSS SAQ-A scope maintained; card data never touches ShopFront servers.",
            "NFR-03 WCAG 2.1 AA for every interactive element in the flow.",
            "NFR-04 The flow degrades to the legacy stepper if the checkout bundle fails to load.",
          ],
          body: [],
        },
        {
          heading: "6. Acceptance Criteria",
          body: [
            "The release is accepted when all FR items pass their linked test cases on staging, the accessibility audit reports no critical issues, and a 5% production canary runs for 72 hours without a rise in payment error rate.",
          ],
        },
      ],
      revisions: [
        {
          changeSummary: "Added wallet payment requirements (FR-04) after the payments provider workshop.",
          editor: "demo-u2",
        },
        {
          changeSummary: "Legal review: clarified card tokenisation consent wording and PCI scope.",
          editor: "demo-u1",
          addSection: {
            heading: "7. Data Protection & Consent",
            body: [
              "Saving a card for future purchases requires explicit, unbundled consent captured at the moment of payment. Consent is stored with a timestamp and the exact wording shown.",
            ],
            bullets: [
              "DP-01 The save-card checkbox is unchecked by default.",
              "DP-02 Customers can delete a saved card from the account page at any time.",
              "DP-03 Deleting a card revokes the token with the payment provider within 24 hours.",
            ],
          },
        },
      ],
      linkEpics: ["checkout"],
      linkStories: [
        "As a shopper I can complete checkout on a single page",
        "As a shopper I can pay with Apple Pay",
        "As a shopper I see delivery estimates",
        "As a shopper I can save my card",
      ],
      annotations: [
        {
          type: "comment",
          text: "Can we confirm the 27% abandonment target with the analytics team before we commit to it publicly?",
          quote: "Reduce checkout abandonment from 38% to at most 27%.",
          author: "demo-u2",
          replies: [{ text: "Confirmed with analytics — 27% is the P50 of comparable retailers.", author: "demo-u1" }],
        },
        {
          type: "highlight",
          text: "Key acceptance gate for the release sign-off.",
          quote: "a 5% production canary runs for 72 hours without a rise in payment error rate",
          author: "demo-u4",
        },
        {
          type: "comment",
          text: "FR-07 needs a test case for the 3-D Secure timeout path.",
          quote: "On payment failure the shopper stays on the page with all entered data preserved.",
          author: "demo-u5",
          resolved: true,
        },
      ],
    },
    {
      key: "search-brd",
      name: "BRD — Faceted Search & Product Discovery",
      filename: "BRD-Faceted-Search.pdf",
      fileType: "pdf",
      status: "Reviewed",
      sections: [
        {
          heading: "1. Background",
          body: [
            "Shoppers currently browse a flat category list with a single sort control. Session recordings show repeated back-and-forth between the results page and individual products, and 22% of searches end with no click.",
            "This document specifies faceted search, richer result cards and a recommendation strip on the product page.",
          ],
        },
        {
          heading: "2. Business Objectives",
          bullets: [
            "Lift search-to-cart conversion by 10%.",
            "Reduce zero-click searches from 22% to under 15%.",
            "Surface long-tail inventory: at least 30% of orders should include a product outside the top 200 sellers.",
          ],
          body: [],
        },
        {
          heading: "3. Functional Requirements",
          bullets: [
            "FR-01 Facets for brand, price band, size, colour and availability, each showing a live result count.",
            "FR-02 Multiple values within a facet combine with OR; different facets combine with AND.",
            "FR-03 The applied facet state is encoded in the URL and restored on back/forward navigation.",
            "FR-04 Facet counts update without a full page reload and within 400ms of selection.",
            "FR-05 The product page shows up to eight related products ranked by co-purchase frequency.",
            "FR-06 When co-purchase data is sparse the strip falls back to same-category best sellers.",
          ],
          body: [],
        },
        {
          heading: "4. Reporting",
          body: [
            "Merchandising needs a weekly report of the ten most-applied facet combinations and the resulting conversion rate, delivered to the existing analytics warehouse.",
          ],
        },
        {
          heading: "5. Acceptance Criteria",
          body: [
            "Accepted when facet counts match a direct catalogue query for a 500-product sample, the URL round-trip preserves state across all supported browsers, and the recommendation strip renders within the product page LCP budget.",
          ],
        },
      ],
      linkEpics: ["catalog"],
      linkStories: ["As a shopper I can filter search results", "As a shopper I see related products"],
      annotations: [
        {
          type: "comment",
          page: 1,
          text: "Merchandising asked whether facet order can be configured per category — worth a follow-up story.",
          quote: "Facets for brand, price band, size, colour and availability",
          author: "demo-u2",
        },
        {
          type: "sticky",
          page: 2,
          text: "Weekly report format agreed with the data team on 12 May.",
          author: "demo-u4",
          resolved: true,
        },
      ],
    },
    {
      key: "returns-brd",
      name: "BRD — Self-Service Returns (Draft)",
      filename: "BRD-Self-Service-Returns.docx",
      fileType: "docx",
      status: "Draft",
      sections: [
        {
          heading: "1. Problem Statement",
          body: [
            "Every return currently goes through a support agent. Returns are 14% of orders and account for 61% of contact volume, at an average handling time of 7 minutes per contact.",
            "This draft captures the requirements for a customer-facing returns flow. Sections marked TBD are pending carrier and finance input.",
          ],
        },
        {
          heading: "2. Draft Functional Requirements",
          bullets: [
            "FR-01 Customers can start a return from any delivered order within the returns window.",
            "FR-02 Eligibility is evaluated per item, not per order.",
            "FR-03 The customer selects a reason from a controlled list; free text is optional.",
            "FR-04 A prepaid carrier label is generated and emailed, and is downloadable from the order page. (TBD: carrier contract)",
            "FR-05 Refund status is shown as a timeline: requested, in transit, received, refunded.",
            "FR-06 Refunds are issued to the original payment method. (TBD: finance approval for wallet refunds)",
          ],
          body: [],
        },
        {
          heading: "3. Open Questions",
          bullets: [
            "Do we support partial refunds when only some items are returned? Assumed yes.",
            "Who absorbs the return shipping cost for a faulty item versus a change of mind?",
            "Is there an exchange flow in phase one, or refund only?",
          ],
          body: [],
        },
      ],
      linkEpics: ["account"],
      linkStories: ["As a customer I can open a return"],
      annotations: [
        {
          type: "comment",
          text: "Refund-only for phase one. Exchanges are explicitly out of scope — please move this to the Assumptions section.",
          quote: "Is there an exchange flow in phase one, or refund only?",
          author: "demo-u1",
        },
      ],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT 2 — PayFlow Wallet
// ─────────────────────────────────────────────────────────────────────────────

const PAYFLOW: SeedProject = {
  id: "demo-proj-payflow",
  name: "PayFlow Wallet",
  boardKey: "PAY",
  webAppUrl: "https://payflow.example.com",
  description: "Consumer wallet: top-ups, peer transfers, bill payments and spend insights.",
  environment: "Staging",
  epics: [
    { key: "onboarding", title: "Onboarding & KYC", description: "Sign-up, identity verification, account activation.", color: "#0ea5e9" },
    { key: "transfers", title: "Transfers & Payments", description: "Peer transfers, bill pay, scheduled payments.", color: "#f97316" },
    { key: "insights", title: "Spend Insights", description: "Categorisation, budgets, monthly statements.", color: "#8b5cf6" },
  ],
  sprints: [
    { key: "past", name: "Sprint 6 — KYC Automation", goal: "Cut manual identity review to under 10% of sign-ups.", status: ScrumSprintStatus.COMPLETED, startDate: d(-30), endDate: d(-16) },
    { key: "active", name: "Sprint 7 — Instant Transfers", goal: "Deliver instant peer transfers with limits and fraud checks.", status: ScrumSprintStatus.ACTIVE, startDate: d(-4), endDate: d(10) },
    { key: "next", name: "Sprint 8 — Budgets", goal: "Ship monthly budgets and category alerts.", status: ScrumSprintStatus.PLANNED, startDate: d(11), endDate: d(25) },
  ],
  stories: [
    {
      title: "As a new user I can verify my identity by scanning my ID",
      description: "Capture the ID document and a selfie in-app, submit to the verification provider and return a decision within 60 seconds for the majority of users.",
      status: TaskStatus.DONE, priority: TaskPriority.HIGHEST, storyPoints: 13, progress: 100,
      epic: "onboarding", sprint: "past", assignees: ["demo-u1", "demo-u5"], labels: ["kyc", "compliance"],
      subtasks: [{ title: "Document capture SDK", completed: true }, { title: "Liveness check", completed: true }, { title: "Manual review queue", completed: true }],
      comments: [{ authorId: "demo-u1", content: "Auto-approval rate is 91% in production — above the 90% target." }],
    },
    {
      title: "As a new user I am told clearly why verification failed",
      description: "Map provider rejection codes to plain-language reasons and a specific next action, instead of the generic failure screen.",
      status: TaskStatus.DONE, priority: TaskPriority.MEDIUM, storyPoints: 3, progress: 100,
      epic: "onboarding", sprint: "past", assignees: ["demo-u4"], labels: ["kyc", "ux"],
    },
    {
      title: "As a user I can send money instantly to another PayFlow user",
      description: "Send by phone number or PayFlow tag with an instant balance update for both parties, subject to per-transaction and daily limits.",
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGHEST, storyPoints: 13, progress: 60,
      epic: "transfers", sprint: "active", assignees: ["demo-u3", "demo-u2"], labels: ["transfers", "core"],
      components: ["ledger", "mobile"], dueDate: d(8),
      subtasks: [
        { title: "Ledger double-entry postings", completed: true },
        { title: "Recipient lookup by tag", completed: true },
        { title: "Limit engine integration", completed: false },
        { title: "Idempotency on retry", completed: false },
      ],
      comments: [
        { authorId: "demo-u3", content: "Idempotency keys are in — a retried transfer no longer double-posts." },
        { authorId: "demo-u2", content: "Compliance wants the limit engine hooked up before we enable this for anyone outside the beta." },
      ],
    },
    {
      title: "As a user I am warned before sending to a new recipient",
      description: "Show a confirmation step with the recipient's masked details and a fraud warning the first time money is sent to a given recipient.",
      status: TaskStatus.REVIEW, priority: TaskPriority.HIGH, storyPoints: 5, progress: 80,
      epic: "transfers", sprint: "active", assignees: ["demo-u5"], labels: ["fraud", "transfers"],
      subtasks: [{ title: "First-time recipient detection", completed: true }, { title: "Warning screen copy", completed: true }],
      comments: [{ authorId: "demo-u5", content: "Copy approved by the financial-crime team." }],
    },
    {
      title: "As a user I can schedule a recurring bill payment",
      description: "Set up a payment that repeats weekly or monthly, with a notification before each run and the ability to skip or cancel a single occurrence.",
      status: TaskStatus.TESTING, priority: TaskPriority.MEDIUM, storyPoints: 8, progress: 85,
      epic: "transfers", sprint: "active", assignees: ["demo-u4"], labels: ["bills"],
      subtasks: [{ title: "Schedule model", completed: true }, { title: "Runner job", completed: true }, { title: "Skip occurrence", completed: true }],
    },
    {
      title: "As a user I can see my spending grouped by category",
      description: "Categorise transactions automatically, show a monthly breakdown, and let the user re-categorise a transaction with the change remembered for that merchant.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGH, storyPoints: 8, progress: 0,
      epic: "insights", sprint: "next", assignees: ["demo-u2"], labels: ["insights"],
      subtasks: [{ title: "Merchant category mapping", completed: false }, { title: "Monthly breakdown chart", completed: false }],
    },
    {
      title: "As a user I can set a monthly budget per category",
      description: "Define a budget per spend category and receive a push notification at 80% and 100% of the budget.",
      status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, storyPoints: 5, progress: 0,
      epic: "insights", sprint: "next", assignees: ["demo-u3"], labels: ["insights", "notifications"],
    },
    {
      title: "As a user I can download a monthly statement as PDF",
      description: "Generate a statement covering a calendar month with opening and closing balances and every transaction, downloadable from the account screen.",
      status: TaskStatus.TODO, priority: TaskPriority.LOW, storyPoints: 5, progress: 0,
      epic: "insights", sprint: null, assignees: [], labels: ["insights", "compliance"],
    },
    {
      title: "As a user I can freeze my card from the app",
      description: "Immediately block new authorisations with a single toggle, and unfreeze just as quickly.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGH, storyPoints: 3, progress: 0,
      epic: "onboarding", sprint: "active", assignees: ["demo-u5"], labels: ["security"],
      subtasks: [{ title: "Freeze toggle + confirmation", completed: false }],
    },
    {
      title: "Transfer limit check uses the wrong timezone at month end",
      description: "The daily limit resets at UTC midnight rather than the user's local midnight, so users in UTC+4 hit a stale limit for four hours.",
      type: TaskType.BUG,
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, storyPoints: 3, progress: 50,
      epic: "transfers", sprint: "active", assignees: ["demo-u3"], labels: ["bug", "limits"],
      comments: [{ authorId: "demo-u3", content: "Limit windows are stored as UTC dates with no offset — needs a user-timezone column." }],
    },
  ],
  brds: [
    {
      key: "transfers-brd",
      name: "BRD — Instant Peer Transfers",
      filename: "BRD-Instant-Transfers.docx",
      fileType: "docx",
      status: "Final",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "This document defines the business requirements for instant peer-to-peer transfers between PayFlow accounts, including limits, fraud controls and the customer experience on failure.",
            "Transfers are the most requested feature in customer research and the primary driver of wallet top-ups.",
          ],
        },
        {
          heading: "2. Business Rules",
          bullets: [
            "BR-01 A transfer settles instantly between two active, fully verified PayFlow accounts.",
            "BR-02 Unverified accounts may receive but not send.",
            "BR-03 Per-transaction limit is 5,000 and the rolling 24-hour limit is 15,000 in account currency.",
            "BR-04 The first transfer to any new recipient requires an explicit confirmation step.",
            "BR-05 A transfer is either fully posted to both ledgers or not posted at all; no partial states are permitted.",
            "BR-06 Retrying a transfer with the same idempotency key must never create a second posting.",
          ],
          body: [],
        },
        {
          heading: "3. Fraud & Compliance Controls",
          body: [
            "Every transfer is scored before posting. Scores above the review threshold hold the transfer for manual review and notify the sender that the payment is pending.",
          ],
          bullets: [
            "FC-01 Velocity checks on sender account age, transfer frequency and amount deviation.",
            "FC-02 Sanctions screening on both parties before posting.",
            "FC-03 A full, immutable audit trail for every decision, retained for seven years.",
          ],
        },
        {
          heading: "4. Failure Handling",
          body: [
            "Failures must be explained in plain language with a clear next step. The sender's balance is never reduced for a failed transfer, and a pending transfer that later fails triggers a push notification and an in-app message.",
          ],
        },
        {
          heading: "5. Acceptance Criteria",
          body: [
            "Accepted when the ledger reconciles to zero variance across a 10,000-transfer soak test, idempotent retries produce exactly one posting, and limits are enforced in the user's local timezone.",
          ],
        },
      ],
      revisions: [
        {
          changeSummary: "Compliance review: added sanctions screening (FC-02) and the seven-year retention rule.",
          editor: "demo-u2",
        },
      ],
      linkEpics: ["transfers"],
      linkStories: [
        "As a user I can send money instantly",
        "As a user I am warned before sending to a new recipient",
        "Transfer limit check uses the wrong timezone",
      ],
      annotations: [
        {
          type: "comment",
          text: "BR-03: are these limits per currency or converted to a base currency? Needs to be explicit before build.",
          quote: "Per-transaction limit is 5,000 and the rolling 24-hour limit is 15,000 in account currency.",
          author: "demo-u3",
          replies: [
            { text: "Per account currency, no conversion. I'll add a note in the next revision.", author: "demo-u2" },
          ],
        },
        {
          type: "highlight",
          text: "This is the acceptance gate the QA soak test is built around.",
          quote: "the ledger reconciles to zero variance across a 10,000-transfer soak test",
          author: "demo-u4",
        },
      ],
    },
    {
      key: "kyc-brd",
      name: "BRD — Onboarding & KYC Requirements",
      filename: "BRD-Onboarding-KYC.pdf",
      fileType: "pdf",
      status: "Reviewed",
      sections: [
        {
          heading: "1. Regulatory Context",
          body: [
            "PayFlow must identify and verify every customer before granting a full-function account. This document translates the regulatory obligation into product requirements and defines the limited-function account available before verification completes.",
          ],
        },
        {
          heading: "2. Verification Journey",
          bullets: [
            "VJ-01 Collect legal name, date of birth, residential address and national ID number.",
            "VJ-02 Capture a government-issued photo ID and a liveness-checked selfie.",
            "VJ-03 Return an automated decision within 60 seconds for at least 90% of applicants.",
            "VJ-04 Route ambiguous cases to a manual review queue with a 4-hour service target.",
            "VJ-05 Explain every rejection in plain language with a specific next action.",
          ],
          body: [],
        },
        {
          heading: "3. Limited-Function Account",
          body: [
            "Before verification completes the customer may explore the app and receive funds, but may not send transfers, pay bills or withdraw. The restriction is stated on every blocked action.",
          ],
        },
        {
          heading: "4. Data Retention",
          bullets: [
            "DR-01 Identity documents are retained for five years after account closure, then deleted.",
            "DR-02 Verification decisions and their reasons are retained for seven years.",
            "DR-03 Selfie images are deleted 30 days after a successful decision.",
          ],
          body: [],
        },
        {
          heading: "5. Acceptance Criteria",
          body: [
            "Accepted when the auto-approval rate meets 90% on a 1,000-application sample, every rejection code maps to a reviewed customer-facing message, and retention jobs are demonstrated end to end in staging.",
          ],
        },
      ],
      linkEpics: ["onboarding"],
      linkStories: ["As a new user I can verify my identity", "As a new user I am told clearly why verification failed"],
      annotations: [
        {
          type: "comment",
          page: 2,
          text: "DR-03 conflicts with the fraud team's request to keep selfies for 90 days on flagged accounts. Needs reconciling.",
          quote: "Selfie images are deleted 30 days after a successful decision.",
          author: "demo-u5",
        },
      ],
    },
    {
      key: "insights-brd",
      name: "BRD — Spend Insights & Budgets",
      filename: "BRD-Spend-Insights.docx",
      fileType: "docx",
      status: "Draft",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "Define the requirements for automatic transaction categorisation, monthly spend breakdowns and per-category budgets with alerting.",
          ],
        },
        {
          heading: "2. Functional Requirements",
          bullets: [
            "FR-01 Every posted transaction is assigned exactly one spend category.",
            "FR-02 The customer can re-categorise a transaction; the correction applies to future transactions from the same merchant.",
            "FR-03 A monthly breakdown shows spend per category with a comparison against the previous month.",
            "FR-04 A customer can set a monthly budget per category.",
            "FR-05 Push notifications fire once at 80% and once at 100% of a category budget per month.",
          ],
          body: [],
        },
        {
          heading: "3. Open Questions",
          bullets: [
            "Should budgets roll over unspent amounts? Assumed no for phase one.",
            "How are refunds treated in the monthly total — netted off or shown separately?",
          ],
          body: [],
        },
      ],
      linkEpics: ["insights"],
      linkStories: ["As a user I can see my spending grouped by category", "As a user I can set a monthly budget"],
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT 3 — HealthHub Portal
// ─────────────────────────────────────────────────────────────────────────────

const HEALTHHUB: SeedProject = {
  id: "demo-proj-healthhub",
  name: "HealthHub Patient Portal",
  boardKey: "HEAL",
  webAppUrl: "https://healthhub.example.com",
  description: "Patient portal: appointment booking, results, prescriptions and secure messaging.",
  environment: "Dev",
  epics: [
    { key: "appointments", title: "Appointments", description: "Booking, rescheduling, reminders.", color: "#e11d48" },
    { key: "records", title: "Records & Results", description: "Test results, documents, history.", color: "#0d9488" },
    { key: "messaging", title: "Secure Messaging", description: "Patient-clinician messaging and triage.", color: "#ca8a04" },
  ],
  sprints: [
    { key: "past", name: "Sprint 3 — Portal Foundations", goal: "Authentication, patient record sync and the portal shell.", status: ScrumSprintStatus.COMPLETED, startDate: d(-26), endDate: d(-12) },
    { key: "active", name: "Sprint 4 — Online Booking", goal: "Patients can book, reschedule and cancel appointments online.", status: ScrumSprintStatus.ACTIVE, startDate: d(-5), endDate: d(9) },
    { key: "next", name: "Sprint 5 — Results Release", goal: "Release test results to patients with clinician-controlled timing.", status: ScrumSprintStatus.PLANNED, startDate: d(10), endDate: d(24) },
  ],
  stories: [
    {
      title: "As a patient I can book an appointment online",
      description: "Choose a clinician, see real availability from the practice system, and confirm a slot with an immediate confirmation email and calendar file.",
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGHEST, storyPoints: 13, progress: 45,
      epic: "appointments", sprint: "active", assignees: ["demo-u1", "demo-u4"], labels: ["booking", "core"],
      components: ["portal", "integration"], dueDate: d(7),
      subtasks: [
        { title: "Availability sync from practice system", completed: true },
        { title: "Slot picker UI", completed: true },
        { title: "Booking confirmation + ICS", completed: false },
        { title: "Double-booking guard", completed: false },
      ],
      comments: [
        { authorId: "demo-u4", content: "Availability sync runs every 90 seconds; a slot can still be taken between load and confirm, hence the double-booking guard." },
      ],
    },
    {
      title: "As a patient I can reschedule or cancel my appointment",
      description: "Change or cancel a booking up to the practice's cut-off time, with the slot released back to availability immediately.",
      status: TaskStatus.IN_PROGRESS, priority: TaskPriority.HIGH, storyPoints: 5, progress: 35,
      epic: "appointments", sprint: "active", assignees: ["demo-u3"], labels: ["booking"],
      subtasks: [{ title: "Cut-off rules per practice", completed: true }, { title: "Cancel + release slot", completed: false }],
    },
    {
      title: "As a patient I get a reminder before my appointment",
      description: "Send an SMS and email reminder 48 hours and 2 hours before the appointment, with a one-tap cancel link.",
      status: TaskStatus.REVIEW, priority: TaskPriority.MEDIUM, storyPoints: 5, progress: 90,
      epic: "appointments", sprint: "active", assignees: ["demo-u5"], labels: ["notifications"],
      subtasks: [{ title: "Reminder scheduler", completed: true }, { title: "One-tap cancel token", completed: true }],
      comments: [{ authorId: "demo-u5", content: "Cancel tokens are single-use and expire at appointment start." }],
    },
    {
      title: "As a patient I can sign in securely with two-factor authentication",
      description: "Password plus a one-time code by SMS or authenticator app, with account recovery via the practice's identity check.",
      status: TaskStatus.DONE, priority: TaskPriority.HIGHEST, storyPoints: 8, progress: 100,
      epic: "records", sprint: "past", assignees: ["demo-u1"], labels: ["security", "compliance"],
      subtasks: [{ title: "TOTP enrolment", completed: true }, { title: "SMS fallback", completed: true }, { title: "Recovery flow", completed: true }],
    },
    {
      title: "As a patient I can see my medication list",
      description: "Show current and past medications with dose, prescriber and start date, sourced from the practice record and refreshed on each visit.",
      status: TaskStatus.DONE, priority: TaskPriority.HIGH, storyPoints: 5, progress: 100,
      epic: "records", sprint: "past", assignees: ["demo-u2"], labels: ["records"],
    },
    {
      title: "As a patient I can view my test results once released",
      description: "Results become visible only after a clinician marks them released, with an explanatory note and a link to book a follow-up.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGHEST, storyPoints: 13, progress: 0,
      epic: "records", sprint: "next", assignees: ["demo-u4"], labels: ["records", "clinical-safety"],
      subtasks: [{ title: "Release-state model", completed: false }, { title: "Result detail view", completed: false }, { title: "Follow-up booking link", completed: false }],
      comments: [{ authorId: "demo-u4", content: "Clinical safety officer must sign off the release rules before this leaves the sprint." }],
    },
    {
      title: "As a clinician I can control when a result is released to the patient",
      description: "Review a result, add a patient-facing note, and choose to release now, release on a date, or withhold pending a consultation.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGH, storyPoints: 8, progress: 0,
      epic: "records", sprint: "next", assignees: ["demo-u1"], labels: ["clinical-safety"],
    },
    {
      title: "As a patient I can message my practice securely",
      description: "Send a non-urgent message to the practice, see a clear response-time expectation, and receive replies in the portal with an email notification.",
      status: TaskStatus.TODO, priority: TaskPriority.MEDIUM, storyPoints: 8, progress: 0,
      epic: "messaging", sprint: null, assignees: [], labels: ["messaging"],
    },
    {
      title: "As a patient I am told when my message is not for emergencies",
      description: "Show an unmissable urgent-care interstitial before the message composer, with local emergency numbers.",
      status: TaskStatus.TODO, priority: TaskPriority.HIGHEST, storyPoints: 2, progress: 0,
      epic: "messaging", sprint: "active", assignees: ["demo-u1"], labels: ["messaging", "clinical-safety"],
      subtasks: [{ title: "Interstitial copy signed off by clinical safety", completed: false }],
    },
    {
      title: "Appointment slots show in the wrong timezone for travelling patients",
      description: "Slots render in the device timezone rather than the practice timezone, so a patient abroad sees times shifted by their local offset.",
      type: TaskType.BUG,
      status: TaskStatus.TESTING, priority: TaskPriority.HIGH, storyPoints: 3, progress: 80,
      epic: "appointments", sprint: "active", assignees: ["demo-u3"], labels: ["bug", "booking"],
      comments: [{ authorId: "demo-u3", content: "Fixed by rendering in practice timezone with an explicit label. Needs a test abroad." }],
    },
  ],
  brds: [
    {
      key: "booking-brd",
      name: "BRD — Online Appointment Booking",
      filename: "BRD-Online-Booking.docx",
      fileType: "docx",
      status: "Reviewed",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "This document specifies online appointment booking for HealthHub, covering availability, booking, rescheduling, cancellation and reminders.",
            "Practices currently take 71% of bookings by telephone, with an average call length of 4 minutes and a measurable peak-time abandonment rate.",
          ],
        },
        {
          heading: "2. Business Objectives",
          bullets: [
            "Move at least 40% of routine bookings online within two quarters of launch.",
            "Reduce did-not-attend rates from 9% to under 6% through reminders and easy cancellation.",
            "Release reception time equivalent to one full-time role per practice.",
          ],
          body: [],
        },
        {
          heading: "3. Functional Requirements",
          bullets: [
            "FR-01 Availability is read from the practice system and refreshed at least every two minutes.",
            "FR-02 A slot is held for the patient for five minutes between selection and confirmation.",
            "FR-03 Confirmation is immediate and includes an email with a calendar attachment.",
            "FR-04 A patient may reschedule or cancel until the practice-defined cut-off time.",
            "FR-05 Cancelled slots return to the availability pool immediately.",
            "FR-06 Reminders are sent 48 hours and 2 hours before the appointment.",
            "FR-07 All times are displayed in the practice timezone with an explicit label.",
            "FR-08 The system must never confirm two bookings for the same slot.",
          ],
          body: [],
        },
        {
          heading: "4. Clinical Safety",
          body: [
            "Online booking is limited to routine appointment types. Urgent and same-day triage remains a telephone process, and the interface states this before a patient begins booking.",
          ],
          bullets: [
            "CS-01 Urgent appointment types are never bookable online.",
            "CS-02 An urgent-care notice with local emergency numbers is shown before the booking flow.",
            "CS-03 A clinical safety case is completed and signed off before go-live.",
          ],
        },
        {
          heading: "5. Accessibility",
          body: [
            "The portal serves a population with a wide range of access needs. WCAG 2.1 AA is a hard requirement, and the booking flow is tested with screen readers and at 200% zoom before each release.",
          ],
        },
        {
          heading: "6. Acceptance Criteria",
          body: [
            "Accepted when a 500-booking concurrency test produces zero double bookings, reminders are delivered within one minute of their scheduled time, and the accessibility audit reports no critical or serious issues.",
          ],
        },
      ],
      revisions: [
        {
          changeSummary: "Added the slot-hold rule (FR-02) and the double-booking guarantee (FR-08) after the concurrency workshop.",
          editor: "demo-u4",
        },
        {
          changeSummary: "Clinical safety officer review: added section 4 and the timezone display rule.",
          editor: "demo-u1",
        },
      ],
      linkEpics: ["appointments"],
      linkStories: [
        "As a patient I can book an appointment online",
        "As a patient I can reschedule or cancel",
        "As a patient I get a reminder",
        "Appointment slots show in the wrong timezone",
      ],
      annotations: [
        {
          type: "comment",
          text: "FR-02: five minutes may be too long at peak. Can we make the hold duration configurable per practice?",
          quote: "A slot is held for the patient for five minutes between selection and confirmation.",
          author: "demo-u3",
          replies: [
            { text: "Agreed — I'll raise a story for per-practice configuration rather than change the BRD now.", author: "demo-u1" },
          ],
        },
        {
          type: "highlight",
          text: "Hard go-live gate — no release without this sign-off.",
          quote: "A clinical safety case is completed and signed off before go-live.",
          author: "demo-u5",
        },
        {
          type: "comment",
          text: "Confirmed the 48h/2h reminder cadence with two pilot practices.",
          quote: "Reminders are sent 48 hours and 2 hours before the appointment.",
          author: "demo-u2",
          resolved: true,
        },
      ],
    },
    {
      key: "results-brd",
      name: "BRD — Test Results Release",
      filename: "BRD-Results-Release.pdf",
      fileType: "pdf",
      status: "Draft",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "Define how test results are released to patients through the portal, with clinician control over timing and wording so that no patient reads a significant result without appropriate context.",
          ],
        },
        {
          heading: "2. Release Model",
          bullets: [
            "RM-01 A result is invisible to the patient until a clinician sets it to released.",
            "RM-02 A clinician may release immediately, schedule release for a future date, or withhold pending consultation.",
            "RM-03 Every release action is attributed to a named clinician and timestamped.",
            "RM-04 A patient-facing note may accompany any released result.",
            "RM-05 Withheld results show the patient nothing at all — not even that a result exists.",
          ],
          body: [],
        },
        {
          heading: "3. Patient Experience",
          body: [
            "A released result is presented with its reference range, the clinician's note where present, and a clear route to book a follow-up appointment. Terminology is plain language, with clinical terms available on request rather than by default.",
          ],
        },
        {
          heading: "4. Open Questions",
          bullets: [
            "Does a scheduled release fire if the clinician is absent and has not reviewed the result?",
            "How are amended results handled after the original has been released?",
            "Is there an audit report for results withheld beyond 30 days?",
          ],
          body: [],
        },
      ],
      linkEpics: ["records"],
      linkStories: ["As a patient I can view my test results", "As a clinician I can control when a result is released"],
      annotations: [
        {
          type: "comment",
          page: 2,
          text: "RM-05 is the right call clinically, but we need to be certain the API does not leak existence through response timing or counts.",
          quote: "Withheld results show the patient nothing at all",
          author: "demo-u4",
        },
        {
          type: "sticky",
          page: 1,
          text: "Draft — do not circulate outside the clinical safety group.",
          author: "demo-u1",
        },
      ],
    },
    {
      key: "messaging-brd",
      name: "BRD — Secure Patient Messaging",
      filename: "BRD-Secure-Messaging.docx",
      fileType: "docx",
      status: "Draft",
      sections: [
        {
          heading: "1. Purpose",
          body: [
            "Specify non-urgent secure messaging between patients and their practice, including triage routing, response-time expectations and the safety boundaries of the channel.",
          ],
        },
        {
          heading: "2. Functional Requirements",
          bullets: [
            "FR-01 A patient may start a message thread with their registered practice only.",
            "FR-02 An urgent-care interstitial with local emergency numbers is shown before the composer.",
            "FR-03 Each thread displays the practice's stated response time.",
            "FR-04 Replies notify the patient by email without including any clinical content.",
            "FR-05 Threads are closed automatically 30 days after the last reply.",
            "FR-06 Every message is retained in the patient record.",
          ],
          body: [],
        },
        {
          heading: "3. Out of Scope",
          body: [
            "Video consultation, prescription requests and third-party carer access are out of scope for phase one and will be specified separately.",
          ],
        },
      ],
      linkEpics: ["messaging"],
      linkStories: ["As a patient I can message my practice securely", "As a patient I am told when my message is not for emergencies"],
    },
  ],
}

const PROJECTS: SeedProject[] = [SHOPFRONT, PAYFLOW, HEALTHHUB]

// ─────────────────────────────────────────────────────────────────────────────
// Document generation — real .pdf / .docx bytes
// ─────────────────────────────────────────────────────────────────────────────

function buildPdf(title: string, subtitle: string, sections: SeedBrdSection[]): Buffer {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 56
  const maxWidth = pageWidth - margin * 2
  let y = margin

  const ensureRoom = (needed: number) => {
    if (y + needed > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text(doc.splitTextToSize(title, maxWidth), margin, y)
  y += 28

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(110)
  doc.text(subtitle, margin, y)
  doc.setTextColor(0)
  y += 24

  const renderSection = (section: SeedBrdSection) => {
    ensureRoom(60)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(doc.splitTextToSize(section.heading, maxWidth), margin, y)
    y += 20

    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    for (const para of section.body) {
      const lines = doc.splitTextToSize(para, maxWidth) as string[]
      for (const line of lines) {
        ensureRoom(16)
        doc.text(line, margin, y)
        y += 15
      }
      y += 6
    }
    for (const bullet of section.bullets ?? []) {
      const lines = doc.splitTextToSize(bullet, maxWidth - 16) as string[]
      lines.forEach((line, i) => {
        ensureRoom(16)
        doc.text(i === 0 ? `•  ${line}` : `    ${line}`, margin, y)
        y += 15
      })
      y += 3
    }
    y += 12
  }

  for (const section of sections) renderSection(section)

  // Appendices always start on a fresh page, so every generated PDF is at least
  // two pages — page-anchored annotations in the seed stay valid.
  doc.addPage()
  y = margin
  renderSection({
    heading: "Appendix A — Document Control",
    body: [
      "This document is maintained by the Business Analysis team. Changes are made only through the BRD Hub so that every revision is versioned and attributable.",
      "Reviewers: Product Owner, Engineering Lead, QA Lead, Compliance. Approval requires the Product Owner and one of Engineering or Compliance depending on the change.",
    ],
    bullets: [
      "Revisions are recorded in the BRD Hub version history with a change summary.",
      "Superseded versions remain downloadable and are never deleted.",
      "Comments and their resolutions form part of the document's audit trail.",
    ],
  })
  renderSection({
    heading: "Appendix B — Traceability",
    body: [
      "Every functional requirement in this document is linked to at least one user story on the project board, and each story carries the test cases that demonstrate the requirement is met.",
      "The links are maintained in the BRD Hub. A requirement with no linked story is treated as unscheduled and is raised at the next refinement session.",
    ],
  })

  return Buffer.from(doc.output("arraybuffer"))
}

async function buildDocx(title: string, subtitle: string, sections: SeedBrdSection[]): Promise<Buffer> {
  const children: any[] = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({ children: [new TextRun({ text: subtitle, italics: true, color: "666666" })] }),
    new Paragraph({ text: "" }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Document", bold: true })] })] }),
            new TableCell({ children: [new Paragraph(title)] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Owner", bold: true })] })] }),
            new TableCell({ children: [new Paragraph("Business Analysis")] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Audience", bold: true })] })] }),
            new TableCell({ children: [new Paragraph("Product, Engineering, QA, Compliance")] }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ]

  for (const section of sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }))
    for (const para of section.body) children.push(new Paragraph({ text: para }))
    for (const bullet of section.bullets ?? []) children.push(new Paragraph({ text: bullet, bullet: { level: 0 } }))
    children.push(new Paragraph({ text: "" }))
  }

  const doc = new Document({ sections: [{ children }] })
  return await Packer.toBuffer(doc)
}

/** Simple HTML rendering used as the editor-saved body for the latest version. */
function buildHtml(title: string, sections: SeedBrdSection[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  const parts = [`<h1>${esc(title)}</h1>`]
  for (const section of sections) {
    parts.push(`<h2>${esc(section.heading)}</h2>`)
    for (const para of section.body) parts.push(`<p>${esc(para)}</p>`)
    if (section.bullets?.length) {
      parts.push(`<ul>${section.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`)
    }
  }
  return parts.join("\n")
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeding
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱 Seeding demo workspace (3 projects, user stories, BRD hub)…\n")

  const passwordHash = await bcrypt.hash("password123", 12)
  for (const u of TEAM) {
    await prisma.user.upsert({
      where: { id: u.id },
      update: { name: u.name, avatarUrl: u.avatarUrl },
      create: { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatarUrl, passwordHash },
    })
  }

  const owner =
    (await prisma.user.findUnique({ where: { email: OWNER_EMAIL } })) ??
    (await prisma.user.findFirst({
      where: { NOT: { id: { startsWith: "demo-u" } } },
      orderBy: { createdAt: "asc" },
    }))
  if (!owner) throw new Error("No user found to own the demo projects.")
  const globalAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } })
  console.log(`   Owner: ${owner.name || owner.email} (${owner.id})\n`)

  const userName = (id: string) => TEAM.find((u) => u.id === id)?.name ?? owner.name ?? owner.email

  for (const p of PROJECTS) {
    console.log(`── ${p.name} (${p.boardKey}) ───────────────────────────────`)

    // Reset only this demo project.
    await prisma.brdDocument.deleteMany({ where: { projectId: p.id } })
    await prisma.task.deleteMany({ where: { projectId: p.id } })
    await prisma.scrumSprint.deleteMany({ where: { projectId: p.id } })
    await prisma.scrumEpic.deleteMany({ where: { projectId: p.id } })
    await prisma.boardColumn.deleteMany({ where: { projectId: p.id } })
    await prisma.projectMember.deleteMany({ where: { projectId: p.id } })
    await rm(path.join(STORAGE_ROOT, "brds", p.id), { recursive: true, force: true })

    await prisma.project.upsert({
      where: { id: p.id },
      update: {
        name: p.name,
        webAppUrl: p.webAppUrl,
        description: p.description,
        boardKey: p.boardKey,
        environment: p.environment as any,
        status: "Active",
        userId: owner.id,
      },
      create: {
        id: p.id,
        name: p.name,
        webAppUrl: p.webAppUrl,
        description: p.description,
        boardKey: p.boardKey,
        environment: p.environment as any,
        userId: owner.id,
      },
    })

    // Members: the owner, the global admin, and the shared demo team.
    await prisma.projectMember.create({ data: { projectId: p.id, userId: owner.id, role: "Owner" } })
    if (globalAdmin && globalAdmin.id !== owner.id) {
      await prisma.projectMember.create({ data: { projectId: p.id, userId: globalAdmin.id, role: "Admin" } })
    }
    for (const u of TEAM) {
      await prisma.projectMember.create({ data: { projectId: p.id, userId: u.id, role: u.role } })
    }

    for (const c of COLUMNS) {
      await prisma.boardColumn.create({
        data: { projectId: p.id, name: c.name, status: c.status, order: c.order, wipLimit: c.wipLimit },
      })
    }

    const sprintIds: Record<string, string> = {}
    for (const s of p.sprints) {
      const sprint = await prisma.scrumSprint.create({
        data: {
          projectId: p.id,
          name: s.name,
          goal: s.goal,
          status: s.status,
          startDate: s.startDate,
          endDate: s.endDate,
        },
      })
      sprintIds[s.key] = sprint.id
    }

    const epicIds: Record<string, string> = {}
    for (const e of p.epics) {
      const epic = await prisma.scrumEpic.create({
        data: { projectId: p.id, title: e.title, description: e.description, color: e.color },
      })
      epicIds[e.key] = epic.id
    }

    const createdStories: { id: string; title: string; taskNumber: number }[] = []
    let rank = 0
    for (const s of p.stories) {
      const task = await prisma.task.create({
        data: {
          projectId: p.id,
          sprintId: s.sprint ? sprintIds[s.sprint] : null,
          epicId: epicIds[s.epic] ?? null,
          title: s.title,
          description: s.description,
          type: s.type ?? TaskType.STORY,
          status: s.status,
          priority: s.priority,
          storyPoints: s.storyPoints,
          progress: s.progress,
          dueDate: s.dueDate ?? null,
          boardRank: rank++,
          tags: s.labels,
          labels: s.labels,
          components: s.components ?? [],
          reporterId: owner.id,
          assignees: { connect: s.assignees.map((id) => ({ id })) },
          subtasks: { create: s.subtasks ?? [] },
          comments: { create: s.comments ?? [] },
          activities: {
            create: [
              { action: "created", details: "Story created from the BRD refinement session", userId: s.assignees[0] ?? owner.id },
              ...(s.status !== TaskStatus.TODO
                ? [{ action: "updated", details: `Status set to ${s.status}`, userId: s.assignees[0] ?? owner.id }]
                : []),
              ...(s.comments ?? []).map((c) => ({ action: "commented", details: c.content, userId: c.authorId })),
            ],
          },
        },
      })
      createdStories.push({ id: task.id, title: task.title, taskNumber: task.taskNumber })
    }
    console.log(`   ✅ ${createdStories.length} stories/bugs, ${p.epics.length} epics, ${p.sprints.length} sprints, ${COLUMNS.length} columns`)

    // ── BRD Hub ──────────────────────────────────────────────────────────────
    for (const b of p.brds) {
      const subtitle = `${p.name} · ${p.boardKey} · Business Requirements Document`
      const brd = await prisma.brdDocument.create({
        data: {
          name: b.name,
          filename: b.filename,
          fileType: b.fileType,
          status: b.status,
          projectId: p.id,
          uploaderId: owner.id,
          uploaderName: owner.name || owner.email,
        },
      })

      const dir = path.join(STORAGE_ROOT, "brds", p.id, brd.id)
      await mkdir(dir, { recursive: true })

      // v1 …vN — each revision appends its section and rewrites the file.
      const sectionsSoFar = [...b.sections]
      const revisions = b.revisions ?? []
      let previousVersionId: string | null = null
      let latestVersionId = ""

      for (let i = 0; i <= revisions.length; i++) {
        const versionNumber = i + 1
        const revision = i === 0 ? null : revisions[i - 1]
        if (revision?.addSection) sectionsSoFar.push(revision.addSection)

        const bytes =
          b.fileType === "pdf"
            ? buildPdf(b.name, subtitle, sectionsSoFar)
            : await buildDocx(b.name, subtitle, sectionsSoFar)

        const storedName = `v${versionNumber}-${b.filename.replace(/[^\w.\-]+/g, "_")}`
        await writeFile(path.join(dir, storedName), bytes)

        const version: { id: string } = await prisma.brdVersion.create({
          data: {
            brdId: brd.id,
            versionNumber,
            storagePath: path.posix.join("brds", p.id, brd.id, storedName),
            fileType: b.fileType,
            fileSize: bytes.length,
            // Only Word docs carry editor HTML, and only for the latest version.
            contentHtml:
              b.fileType === "docx" && i === revisions.length ? buildHtml(b.name, sectionsSoFar) : null,
            changeSummary: revision?.changeSummary ?? "Initial version uploaded.",
            editorId: revision ? revision.editor : owner.id,
            editorName: revision ? userName(revision.editor) : owner.name || owner.email,
            previousVersionId,
            createdAt: d(-20 + i * 6),
          },
        })
        previousVersionId = version.id
        latestVersionId = version.id
      }

      await prisma.brdDocument.update({
        where: { id: brd.id },
        data: { currentVersionId: latestVersionId },
      })

      // Traceability links to epics and user stories.
      for (const epicKey of b.linkEpics) {
        const epic = p.epics.find((e) => e.key === epicKey)
        if (!epic || !epicIds[epicKey]) continue
        await prisma.brdLink.create({
          data: {
            brdId: brd.id,
            linkType: "epic",
            epicId: epicIds[epicKey],
            label: epic.title,
            createdById: owner.id,
          },
        })
      }
      let linkedStories = 0
      for (const prefix of b.linkStories) {
        const story = createdStories.find((s) => s.title.startsWith(prefix))
        if (!story) {
          console.warn(`   ⚠️  No story matched "${prefix}" for ${b.name}`)
          continue
        }
        await prisma.brdLink.create({
          data: {
            brdId: brd.id,
            linkType: "story",
            taskId: story.id,
            label: `${p.boardKey}-${story.taskNumber} ${story.title}`,
            createdById: owner.id,
          },
        })
        linkedStories++
      }

      // Annotations (threaded: replies hang off their parent).
      for (const a of b.annotations ?? []) {
        const parent = await prisma.brdAnnotation.create({
          data: {
            brdId: brd.id,
            page: b.fileType === "pdf" ? a.page ?? 1 : null,
            x: b.fileType === "pdf" ? 0.12 + Math.random() * 0.5 : null,
            y: b.fileType === "pdf" ? 0.15 + Math.random() * 0.6 : null,
            type: a.type,
            color: a.type === "highlight" ? "#fde68a" : a.type === "sticky" ? "#bfdbfe" : null,
            text: a.text,
            quote: a.quote ?? null,
            resolved: a.resolved ?? false,
            authorId: a.author,
            authorName: userName(a.author),
          },
        })
        for (const r of a.replies ?? []) {
          await prisma.brdAnnotation.create({
            data: {
              brdId: brd.id,
              type: "comment",
              text: r.text,
              parentId: parent.id,
              authorId: r.author,
              authorName: userName(r.author),
            },
          })
        }
      }

      // Audit trail matching the history above.
      const audit: { action: string; detail: string; actor: string; at: Date }[] = [
        { action: "created", detail: `Uploaded ${b.filename}`, actor: owner.id, at: d(-20) },
      ]
      revisions.forEach((r, i) => {
        audit.push({ action: "version.created", detail: `v${i + 2} — ${r.changeSummary}`, actor: r.editor, at: d(-14 + i * 6) })
      })
      if (b.status !== "Draft") {
        audit.push({ action: "status.changed", detail: `Status changed to ${b.status}`, actor: "demo-u2", at: d(-3) })
      }
      for (const a of b.annotations ?? []) {
        audit.push({ action: "annotation.added", detail: `${a.type} by ${userName(a.author)}`, actor: a.author, at: d(-2) })
      }
      audit.push({ action: "link.added", detail: `Linked ${b.linkEpics.length} epic(s) and ${linkedStories} story(ies)`, actor: owner.id, at: d(-1) })

      for (const a of audit) {
        await prisma.brdAuditLog.create({
          data: {
            brdId: brd.id,
            action: a.action,
            detail: a.detail,
            actorId: a.actor,
            actorName: a.actor === owner.id ? owner.name || owner.email : userName(a.actor),
            createdAt: a.at,
          },
        })
      }

      console.log(
        `   📄 ${b.name} — ${revisions.length + 1} version(s), ${b.linkEpics.length + linkedStories} link(s), ${(b.annotations ?? []).length} annotation(s)`
      )
    }
    console.log()
  }

  const totals = await Promise.all([
    prisma.project.count({ where: { id: { in: PROJECTS.map((p) => p.id) } } }),
    prisma.task.count({ where: { projectId: { in: PROJECTS.map((p) => p.id) } } }),
    prisma.brdDocument.count({ where: { projectId: { in: PROJECTS.map((p) => p.id) } } }),
    prisma.brdVersion.count({ where: { brd: { projectId: { in: PROJECTS.map((p) => p.id) } } } }),
  ])

  console.log("✨ Done.")
  console.log(`   Projects: ${totals[0]} · Stories/bugs: ${totals[1]} · BRDs: ${totals[2]} (${totals[3]} versions)`)
  for (const p of PROJECTS) {
    console.log(`   • ${p.name}: /projects/${p.id}/scrum  |  /projects/${p.id}/brds`)
  }
  console.log(`\n   Demo team password: password123`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
