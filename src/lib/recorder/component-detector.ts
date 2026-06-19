export type ComponentType =
  | "button"
  | "link"
  | "input"
  | "textarea"
  | "native_select"
  | "custom_select"
  | "searchable_select"
  | "multi_select"
  | "autocomplete"
  | "checkbox"
  | "radio"
  | "date_picker"
  | "time_picker"
  | "file_upload"
  | "modal"
  | "tab"
  | "menu"
  | "table"
  | "pagination"
  | "accordion"
  | "toast"
  | "toggle"
  | "slider"
  | "unknown";

export function detectComponentType(el: HTMLElement): ComponentType {
  if (!el) return "unknown";

  const tagName = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || "";
  const typeAttr = el.getAttribute("type") || "";
  const className = el.className;
  const classes = typeof className === "string" ? className.toLowerCase() : "";
  const placeholder = el.getAttribute("placeholder")?.toLowerCase() || "";
  const name = el.getAttribute("name")?.toLowerCase() || "";
  const id = el.id?.toLowerCase() || "";

  // 1. native_select
  if (tagName === "select") {
    return "native_select";
  }

  // 2. checkbox & radio
  if (tagName === "input" && typeAttr === "checkbox") {
    return "checkbox";
  }
  if (tagName === "input" && typeAttr === "radio") {
    return "radio";
  }
  if (role === "checkbox") {
    return "checkbox";
  }
  if (role === "radio") {
    return "radio";
  }

  // 3. file_upload
  if (tagName === "input" && typeAttr === "file") {
    return "file_upload";
  }

  // 4. date_picker & time_picker
  if (tagName === "input" && typeAttr === "date") {
    return "date_picker";
  }
  if (tagName === "input" && typeAttr === "time") {
    return "time_picker";
  }
  if (
    placeholder.includes("date") ||
    placeholder.includes("calendar") ||
    placeholder.includes("dd/mm/yyyy") ||
    placeholder.includes("mm/dd/yyyy") ||
    placeholder.includes("select date") ||
    placeholder.includes("yyyy-mm-dd") ||
    name.includes("date") ||
    id.includes("date") ||
    classes.includes("datepicker") ||
    classes.includes("calendar-picker") ||
    classes.includes("react-datepicker") ||
    el.closest(".datepicker") ||
    el.closest(".calendar-picker") ||
    el.closest(".react-datepicker-wrapper") ||
    el.closest("[aria-haspopup='grid']")
  ) {
    return "date_picker";
  }

  if (
    placeholder.includes("time") ||
    placeholder.includes("clock") ||
    placeholder.includes("select time") ||
    name.includes("time") ||
    id.includes("time") ||
    classes.includes("timepicker") ||
    el.closest(".timepicker")
  ) {
    return "time_picker";
  }

  // 5. slider
  if (tagName === "input" && typeAttr === "range") {
    return "slider";
  }
  if (role === "slider" || classes.includes("slider") || el.closest(".slider") || el.closest("[role='slider']")) {
    return "slider";
  }

  // 6. toggle (switch)
  if (role === "switch" || classes.includes("switch") || classes.includes("toggle") || el.closest("[role='switch']")) {
    return "toggle";
  }

  // 7. tab
  if (role === "tab" || classes.includes("tab") || classes.includes("-tab-") || el.closest("[role='tablist']")) {
    return "tab";
  }

  // 8. menu
  if (role === "menuitem" || role === "menu" || classes.includes("menuitem") || el.closest("[role='menu']")) {
    return "menu";
  }

  // 9. accordion
  if (
    el.closest(".accordion") ||
    classes.includes("accordion-trigger") ||
    classes.includes("accordion-header") ||
    el.getAttribute("aria-controls")?.includes("accordion")
  ) {
    return "accordion";
  }

  // 10. pagination
  if (
    el.closest(".pagination") ||
    el.closest("nav[aria-label*='pagination']") ||
    classes.includes("pagination") ||
    placeholder.includes("page")
  ) {
    return "pagination";
  }

  // 11. toast / alert
  if (
    role === "alert" ||
    role === "status" ||
    classes.includes("toast") ||
    classes.includes("notification") ||
    classes.includes("alert") ||
    classes.includes("snackbar") ||
    el.closest("[role='alert']") ||
    el.closest(".toast")
  ) {
    return "toast";
  }

  // 12. table
  if (tagName === "table" || tagName === "td" || tagName === "tr" || tagName === "th" || role === "grid" || el.closest("table") || el.closest("[role='grid']")) {
    return "table";
  }

  // 13. modal / dialog
  if (role === "dialog" || el.getAttribute("aria-modal") === "true" || el.closest("[role='dialog']") || el.closest(".modal")) {
    return "modal";
  }

  // 14. multi_select (combobox/select with multiple option attributes)
  if (
    el.closest(".multi-select") ||
    classes.includes("multi-select") ||
    classes.includes("multiselect") ||
    el.getAttribute("aria-multiselectable") === "true" ||
    el.closest("[aria-multiselectable='true']")
  ) {
    return "multi_select";
  }

  // 15. searchable_select / autocomplete
  if (
    tagName === "input" && (
      role === "combobox" ||
      el.getAttribute("aria-autocomplete") === "list" ||
      el.getAttribute("aria-autocomplete") === "both" ||
      classes.includes("combobox") ||
      classes.includes("autocomplete") ||
      classes.includes("select-input") ||
      placeholder.includes("search") ||
      placeholder.includes("find") ||
      placeholder.includes("select")
    )
  ) {
    return "searchable_select";
  }

  // 16. custom_select (combobox buttons/divs)
  if (
    role === "combobox" ||
    el.getAttribute("aria-haspopup") === "listbox" ||
    classes.includes("select-trigger") ||
    classes.includes("dropdown-trigger") ||
    classes.includes("combobox-trigger") ||
    el.closest(".select-trigger") ||
    el.closest(".dropdown-trigger")
  ) {
    return "custom_select";
  }

  // 17. standard inputs
  if (tagName === "input") {
    return "input";
  }
  if (tagName === "textarea") {
    return "textarea";
  }
  if (tagName === "button" || role === "button" || typeAttr === "button" || typeAttr === "submit") {
    return "button";
  }
  if (tagName === "a" || role === "link") {
    return "link";
  }

  return "unknown";
}
