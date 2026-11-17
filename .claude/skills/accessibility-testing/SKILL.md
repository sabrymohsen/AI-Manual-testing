---
name: accessibility-testing
description: Test a page or component for accessibility against WCAG 2.2 AA, with automated axe checks plus manual keyboard, screen-reader, zoom and contrast checks. Use when asked about accessibility, a11y, WCAG, screen readers, keyboard navigation or color contrast.
---

# Accessibility testing (WCAG 2.2 AA)

## 1. Automated scan (catches roughly a third of issues)
In Playwright (`@axe-core/playwright`; add it as a devDependency if missing):
```ts
import AxeBuilder from "@axe-core/playwright"
const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze()
expect(results.violations).toEqual([])
```
Or in a live browser, inject axe-core from the page context and run `axe.run()`.
Report each violation with rule id, impact, element and fix.

## 2. Manual checks (the rest)
- **Keyboard only**: Tab/Shift+Tab reach every control in a logical order; focus is
  always visible; Enter/Space activate; Esc closes dialogs; focus is trapped in modals
  and returns to the trigger; no keyboard traps; skip link to main content.
- **Screen reader** (VoiceOver: Cmd+F5): every control has a name and role; images have
  alt (or empty alt if decorative); headings form an outline; form errors are announced
  and tied to their field (`aria-describedby`); live updates use `aria-live`.
- **Zoom/reflow**: 200% zoom and 320px width with no lost content or horizontal scroll.
- **Contrast**: text 4.5:1 (large 3:1), UI components and focus ring 3:1, in light and dark themes.
- **Not by color alone**: status/errors also have text or icons.
- **Motion**: respects `prefers-reduced-motion`; nothing flashes >3 times/sec.
- **Forms**: visible labels, required marked, input `type`/`autocomplete` set.
- **Target size**: at least 24×24 CSS px.

## Report
Per issue: WCAG criterion (e.g. 1.4.3 Contrast), severity, element/location, how to
reproduce, suggested fix. File real defects with the `bug-report` skill.
