/**
 * Layout configuration properties for the design-time injected picker and steps recorder frame.
 */
export const recorderToolbarConfig = {
  theme: "dark",
  height: 56,
  position: "bottom" as const,
  buttons: [
    { id: "record", label: "Record", type: "toggle" },
    { id: "pause", label: "Pause", type: "toggle" },
    { id: "assertion", label: "Add Assertion", type: "action" },
    { id: "finish", label: "Save & Complete", type: "action" }
  ],
  overlayColor: "rgba(99, 102, 241, 0.15)", // Indigo indicator highlighter
  borderColor: "rgb(99, 102, 241)"
}
