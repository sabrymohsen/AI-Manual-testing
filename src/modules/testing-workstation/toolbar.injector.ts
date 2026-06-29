/**
 * Toolbar injector configurations for the manual execution workstation floating bar.
 */
export const workstationToolbarConfig = {
  theme: "light",
  height: 48,
  position: "top" as const,
  buttons: [
    { id: "screenshot", label: "📸 Capture screenshot", action: "screenshot" },
    { id: "bug", label: "🐞 File Defect", action: "bug" },
    { id: "pass", label: "✓ Mark Passed", action: "pass" },
    { id: "fail", label: "✗ Mark Failed", action: "fail" }
  ],
  accentColor: "rgb(225, 29, 72)", // Rose indicator highlighter for defects logs
  hoverColor: "rgba(225, 29, 72, 0.05)"
}
