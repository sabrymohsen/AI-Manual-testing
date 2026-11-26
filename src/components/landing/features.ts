import {
  Bell,
  Bug,
  Camera,
  ChartLine,
  ChatCircle,
  Code,
  FileArrowUp,
  FileText,
  Kanban,
  ListChecks,
  Robot,
  ShieldCheck,
  Sparkle,
  TestTube,
  Users,
  VideoCamera,
} from "@phosphor-icons/react/dist/ssr"

/**
 * Copy for the public website. Page names are the app's real sidebar names,
 * so what people read here is what they find inside. Copy rules (SKILL.md):
 * benefit first, no hyphens in text, no invented numbers or testimonials.
 */

export interface Benefit {
  id: string
  label: string
  title: string
  text: string
  pages: { icon: any; name: string }[]
  points: string[]
}

export const BENEFITS: Benefit[] = [
  {
    id: "plan",
    label: "Plan",
    title: "Know what to test before the sprint starts",
    text: "Upload the BRD and get its requirements as a list you can check, each one matched to the sentence it came from.",
    pages: [
      { icon: FileText, name: "BRD Hub" },
      { icon: Kanban, name: "Scrum Board" },
      { icon: ChartLine, name: "Reports" },
    ],
    points: [
      "Flags vague wording and open questions early",
      "Creates the epics and user stories on the board in one click",
      "Burndown, velocity and defect trends from your own sprints",
    ],
  },
  {
    id: "test",
    label: "Test",
    title: "Prove every result with evidence",
    text: "Write clear test cases, run them in a real browser, and keep the video and screenshots with every result.",
    pages: [
      { icon: ListChecks, name: "Test Cases" },
      { icon: TestTube, name: "Live QA Session" },
      { icon: Camera, name: "Visual Tests" },
    ],
    points: [
      "AI drafts cases from a requirement, a person approves them",
      "Every session is recorded, any moment can become a bug",
      "Pixel comparison against screenshots you approved",
    ],
  },
  {
    id: "automate",
    label: "Automate",
    title: "Replay the checks you repeat every release",
    text: "Record a flow once or write it in plain Playwright JavaScript, then run it on a schedule or from your CI.",
    pages: [
      { icon: Code, name: "Automation Hub" },
      { icon: VideoCamera, name: "Recorder Studio" },
    ],
    points: [
      "Runs keep their screenshots, videos and traces",
      "Encrypted secrets and environments per project",
      "Flaky tests are found and listed for you",
    ],
  },
  {
    id: "track",
    label: "Track",
    title: "Send bugs your developers can act on",
    text: "Every bug arrives with steps, expected and actual results, screenshots and a severity, in the tracker your team already uses.",
    pages: [{ icon: Bug, name: "Bug Reports" }],
    points: [
      "AI drafts the title, steps and severity from a failed step",
      "Import bugs with their screenshots from an automation report PDF",
      "Syncs both ways with Jira, Azure DevOps, OpenProject and ClickUp",
    ],
  },
  {
    id: "team",
    label: "Team",
    title: "Keep the whole QA team in one place",
    text: "Talk, assign and follow the work without leaving the app, with the right access for each person.",
    pages: [
      { icon: ChatCircle, name: "Team Chat" },
      { icon: Users, name: "Members" },
      { icon: Bell, name: "Notifications" },
    ],
    points: [
      "Channels and private messages with mentions of tests and bugs",
      "Owner, Admin, Member and Viewer roles per project",
      "A live bell for assignments, mentions and finished AI work",
    ],
  },
]

/** Problem → solution: what testing from a BRD usually looks like, and what changes. */
export const PROBLEMS = [
  {
    before: "Requirements hide inside a long Word document",
    after: "Every requirement is listed, linked to its sentence in the BRD",
  },
  {
    before: "Test cases are typed out by hand, one by one",
    after: "AI drafts the test cases and your team reviews them",
  },
  {
    before: "Each bug is written twice, once for QA and once for Jira",
    after: "One bug with evidence, synced to your tracker",
  },
]

export const STEPS = [
  {
    icon: FileArrowUp,
    title: "Upload your BRD",
    text: "Word or PDF, in Arabic or English. QA Engine reads it and lists what needs testing.",
  },
  {
    icon: Sparkle,
    title: "Review what the AI found",
    text: "Requirements, user stories and test cases arrive as drafts. Nothing is saved until you approve it.",
  },
  {
    icon: TestTube,
    title: "Run the tests and file the bugs",
    text: "Test in a recorded browser. Failed steps become bugs with screenshots, sent to your tracker.",
  },
]

export const AI_POINTS = [
  {
    icon: ShieldCheck,
    title: "Built on QA practice",
    text: "Every request carries testing know how: test design techniques, clear steps, severity rules and resilient locators.",
  },
  {
    icon: FileText,
    title: "Checked, not guessed",
    text: "Requirements are matched to the document's own words. Anything the AI cannot point to is marked unverified.",
  },
  {
    icon: Robot,
    title: "Free AI on your own computer",
    text: "The desktop app finds Ollama by itself and runs requests on your machine. Or add a key for Kimi, OpenAI, Anthropic or Gemini.",
  },
  {
    icon: Sparkle,
    title: "Keeps working while you do",
    text: "Long AI jobs run in the background. You get a notification when your test cases are ready.",
  },
]

export const FAQ = [
  {
    q: "Do I need to install anything?",
    a: "No. QA Engine works in your browser. The desktop app is optional. It gives QA Engine its own window and lets the AI run on your own computer with Ollama.",
  },
  {
    q: "Does it support Arabic?",
    a: "Yes. BRDs, requirements, test cases and bug reports work in Arabic and English, and the AI answers in the language of the document.",
  },
  {
    q: "Which AI does it use?",
    a: "Your choice: free Ollama models on your own computer, or a cloud provider such as Kimi, OpenAI, Anthropic or Gemini with your own key. Without any AI, built in rules still pull out requirements and draft bugs.",
  },
  {
    q: "Does the AI save anything without asking?",
    a: "No. Requirements, stories, test cases and bugs from the AI arrive as drafts. A person reviews them, and only then are they saved.",
  },
  {
    q: "Can it work with Jira or Azure DevOps?",
    a: "Yes. Stories and bugs sync with Jira, Azure DevOps, OpenProject and ClickUp, using the statuses your tracker already has.",
  },
  {
    q: "Can I bring in bugs from my automation runs?",
    a: "Yes. On Bug Reports, import the bug report PDF that your automation produces. QA Engine creates one bug per entry, with its steps, results and screenshots.",
  },
  {
    q: "Who can see my projects?",
    a: "Only the people you invite. Each member gets a role in the project: Owner, Admin, Member or Viewer.",
  },
  {
    q: "How do updates work?",
    a: "The website updates by itself and shows a Reload prompt. The desktop app tells you when a new version is out and installs it in one click.",
  },
  {
    q: "Why does my Mac or Windows warn me the first time?",
    a: "The desktop app is not signed with a paid certificate yet. On Mac, open System Settings, then Privacy and Security, and click Open Anyway. On Windows, click More info and then Run anyway. You only do this once.",
  },
]

export const TRACKERS = ["Jira", "Azure DevOps", "OpenProject", "ClickUp"]

export const NAV = [
  { href: "#product", label: "Product" },
  { href: "#how", label: "How it works" },
  { href: "#ai", label: "AI" },
  { href: "#download", label: "Desktop app" },
  { href: "#faq", label: "FAQ" },
]
