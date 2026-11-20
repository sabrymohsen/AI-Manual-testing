import {
  BarChart3,
  Bell,
  Bot,
  Bug,
  Camera,
  Cpu,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  KanbanSquare,
  LayoutDashboard,
  MessageSquare,
  ShieldCheck,
  Users,
  Video,
} from "lucide-react"

/**
 * Feature copy for the public website. Names are the app's real page names
 * (the sidebar), so what people read here is what they find inside.
 */
export interface Feature {
  icon: any
  name: string
  summary: string
  points: string[]
}

export interface FeatureGroup {
  id: string
  label: string
  title: string
  blurb: string
  features: Feature[]
}

export const FEATURE_GROUPS: FeatureGroup[] = [
  {
    id: "plan",
    label: "Plan",
    title: "From the business document to a planned sprint",
    blurb: "Start where the work starts: the BRD. Turn it into requirements, epics and user stories, then plan the sprint.",
    features: [
      {
        icon: FileSpreadsheet,
        name: "BRD Hub",
        summary: "Upload Word or PDF requirement documents and let AI pull out what needs testing.",
        points: [
          "Versions, preview, comments and review approvals",
          "AI analysis in Arabic and English, checked against the document's own text",
          "Flags vague wording and open questions before testing starts",
          "One click creates the epics and user stories on the Scrum board",
        ],
      },
      {
        icon: KanbanSquare,
        name: "Scrum Board",
        summary: "Backlog, sprints and a board your team moves cards on — with tests attached to every story.",
        points: [
          "Drag-and-drop board, backlog and sprints",
          "Story detail with subtasks, links, attachments and work logs",
          "Each story shows its test cases and whether they pass",
          "Sync with Jira, Azure DevOps, OpenProject or ClickUp",
        ],
      },
      {
        icon: BarChart3,
        name: "Reports",
        summary: "Burndown, velocity, defect trends and coverage — live from your sprints and test runs.",
        points: ["Sprint burndown and velocity", "Defect trends and test coverage"],
      },
      {
        icon: LayoutDashboard,
        name: "Dashboard",
        summary: "Every project's health on one screen: tests, bugs and recent activity.",
        points: ["Test and bug numbers per project", "Recent activity across the team"],
      },
    ],
  },
  {
    id: "test",
    label: "Test",
    title: "Manual testing that's fast to write and easy to prove",
    blurb: "Write clear test cases, run them in a real browser, and keep the evidence with every result.",
    features: [
      {
        icon: FileText,
        name: "Test Cases",
        summary: "A test library built for testers: steps, expected results, priorities and history.",
        points: [
          "AI drafts test cases from a requirement — reviewed before they count",
          "Suites, tags, filters and bulk edits",
          "Versions and review state on every case",
          "Linked to requirements and stories for full traceability",
        ],
      },
      {
        icon: FlaskConical,
        name: "Live QA Session",
        summary: "Test inside a browser streamed into the app while everything is recorded.",
        points: [
          "Video of the whole session",
          "Turn any moment into a bug with an annotated screenshot",
          "Session history with every recording and bug",
        ],
      },
      {
        icon: Video,
        name: "Recorder Studio",
        summary: "Click through your website once; get a test you can replay.",
        points: ["Records real clicks and typing", "Readable steps you can edit", "Replay as an automated test"],
      },
      {
        icon: Camera,
        name: "Visual Tests",
        summary: "Catch layout changes before your users do.",
        points: [
          "Check a whole website, a list of pages or a test case's steps",
          "Pixel comparison against approved screenshots",
          "Approve a change in one click",
        ],
      },
    ],
  },
  {
    id: "automate",
    label: "Automate",
    title: "Automation in plain Playwright JavaScript",
    blurb: "No framework to learn: write or record standard Playwright tests and run them from the app.",
    features: [
      {
        icon: Cpu,
        name: "Automation Hub",
        summary: "Write, record, run and debug automated tests in one place.",
        points: [
          "Editor with Playwright autocomplete and checks",
          "Runs queue up and keep their screenshots, videos and traces",
          "Schedules and CI triggers, parallel runs",
          "Environment variables and encrypted secrets",
          "Visual comparison and flaky-test detection",
        ],
      },
    ],
  },
  {
    id: "track",
    label: "Track",
    title: "Bugs your developers can act on",
    blurb: "Every bug arrives with steps, evidence and the right severity — and lands in the tracker your team already uses.",
    features: [
      {
        icon: Bug,
        name: "Bug Reports",
        summary: "Write a clear bug in seconds, from a failed step or a screenshot.",
        points: [
          "AI drafts the title, steps and expected vs. actual result",
          "Suggested severity and a summary for developers",
          "Board with statuses from your own tracker",
          "Two-way sync with Jira, Azure DevOps, OpenProject or ClickUp",
        ],
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    title: "The whole QA team in one place",
    blurb: "Talk, assign and keep everyone up to date without leaving the app.",
    features: [
      {
        icon: MessageSquare,
        name: "Team Chat",
        summary: "Project channels and private messages, with @mentions of people, tests and bugs.",
        points: ["Real-time channels and direct messages", "Mentions notify the right person"],
      },
      {
        icon: Users,
        name: "Members",
        summary: "Invite your team and decide who can do what in each project.",
        points: ["Owner, Admin, Member and Viewer roles", "Fine-grained permissions per project", "Email invitations"],
      },
      {
        icon: Bell,
        name: "Notifications",
        summary: "A live bell for assignments, mentions, BRD changes and finished AI work.",
        points: ["Real-time, on every page", "Links straight to what changed"],
      },
    ],
  },
]

/** The journey shown under the hero. */
export const FLOW = [
  { icon: FileSpreadsheet, label: "BRD" },
  { icon: KanbanSquare, label: "Stories" },
  { icon: FileText, label: "Test cases" },
  { icon: FlaskConical, label: "Run" },
  { icon: Bug, label: "Bugs" },
  { icon: BarChart3, label: "Reports" },
]

export const AI_POINTS = [
  {
    icon: ShieldCheck,
    title: "Built-in QA expertise",
    text: "Every AI request carries testing know-how — test design techniques, clear steps, severity rules, resilient locators — so answers follow good QA practice.",
  },
  {
    icon: FileSpreadsheet,
    title: "Checked, not guessed",
    text: "Requirements found in a BRD are matched to the document's own words. Anything the AI can't point to is marked as unverified, and nothing is saved until you review it.",
  },
  {
    icon: Bot,
    title: "Free AI on your own computer",
    text: "Have Ollama? The desktop app finds it automatically and runs your AI requests on your machine — free and private. Or add a key for Kimi, OpenAI, Anthropic or Gemini.",
  },
  {
    icon: Cpu,
    title: "Keeps working while you do",
    text: "Long AI jobs run in the background. Move anywhere in the app — you'll get a message when your test cases are ready.",
  },
]

export const FAQ = [
  {
    q: "Do I need to install anything?",
    a: "No. QA Engine works in your browser. The desktop app is optional — it gives QA Engine its own window and lets the AI run on your own computer with Ollama.",
  },
  {
    q: "Does it support Arabic?",
    a: "Yes. BRDs, requirements, test cases and bug reports work in Arabic and English, and the AI answers in the document's language.",
  },
  {
    q: "Which AI does it use?",
    a: "Your choice: free Ollama models on your own computer (found automatically by the desktop app), or a cloud provider such as Kimi, OpenAI, Anthropic or Gemini with your own key. Without any AI, built-in rules still extract requirements and draft bugs.",
  },
  {
    q: "Can it work with Jira or Azure DevOps?",
    a: "Yes. Stories and bugs sync with Jira, Azure DevOps, OpenProject and ClickUp, using your tracker's own statuses.",
  },
  {
    q: "How do updates work?",
    a: "The website updates on its own — you'll see a Reload prompt. The desktop app tells you when a new version is out and installs it with one click.",
  },
  {
    q: "Why does my Mac or Windows warn me the first time?",
    a: "The desktop app isn't signed with a paid certificate yet, so Mac and Windows don't recognise it. On Mac, open System Settings → Privacy & Security and click Open Anyway. On Windows, if the browser holds the download, open Downloads (Ctrl+J), click ⋯ → Keep → Keep anyway; then on \"Windows protected your PC\" click More info → Run anyway. Don't double-click a file ending in .crdownload or .partial — that's an unfinished download. You only do this once; the Windows .zip is an alternative that needs no install.",
  },
]
