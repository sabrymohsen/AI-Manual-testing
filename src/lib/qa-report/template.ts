/**
 * Builds the downloadable QA / UAT testing report.
 *
 * The output is ONE self-contained .html file. It carries its own data inline
 * (between the __QA_DATA__ markers), renders the dashboard from that data on
 * load, and ships the same edit-and-download affordances the tester used in
 * the app — so the file that lands in a stakeholder's inbox is still editable,
 * and re-downloading it from there produces an updated copy of itself. No
 * server round-trip, no login, nothing to install.
 *
 * Vocabulary note: the report speaks the app's own language — Priority is
 * Critical/High/Medium/Low and bug status is the eight-value BugStatus enum.
 * Nothing is folded into a foreign scheme, because a ReadyForRetest bug shown
 * as "Open" is a lie the reader has no way to detect.
 */

export interface QaReportMeta {
  title: string
  org: string
  system: string
  environment: string
  dateRange: string
  overallStatus: string
  engineer: string
  reportDate: string
  fileName: string
}

export interface QaReportService {
  /** Project module this row came from; null for a row typed into the report. */
  suiteId?: string | null
  name: string
  total: number
  passed: number
  failed: number
  blocked: number
  status: string
  remarks: string
}

export interface QaReportDefect {
  /**
   * The bug this row came from, or undefined for a row typed into the report.
   *
   * Present so an edit made here can be written back to that bug instead of
   * living only in the downloaded file.
   */
  id?: string
  key: string
  title: string
  severity: string
  priority: string
  status: string
  /** Module/service the defect is filed under; "Unfiled" when it has none. */
  module: string
  /** The linked test case, when there is one. Narrower than the module. */
  area: string
  assignedTo: string
  reportedOn: string
}

export interface QaReportData {
  meta: QaReportMeta
  services: QaReportService[]
  defects: QaReportDefect[]
}

/**
 * Serialise the payload for embedding inside a <script> block. `<` is escaped
 * so a bug title containing "</script>" cannot break out of the block, and the
 * two line separators that are legal in JSON but not in JS source are escaped
 * too.
 */
function embed(data: QaReportData): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

/** Render the standalone report. Returns the complete HTML document. */
export function buildQaReportHtml(data: QaReportData): string {
  // Function replacement: a "$&" inside a bug title must not be treated as a
  // replacement pattern.
  return DOC.replace("__QA_REPORT_DATA__", () => embed(data))
}

const DOC = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Testing Report</title>
<style>
/* ── Icons ────────────────────────────────────────────────────────────────
   Inline, so the report needs no network. It previously linked Font Awesome
   from a CDN, which meant a downloaded report opened offline — the normal way
   a report is read after it is forwarded — showed empty boxes where every icon
   should be.

   Drawn with CSS masks rather than <img>, so each glyph inherits the colour of
   the text around it exactly as the font-based icons did, and no markup had to
   change: the existing <i class="fas fa-x"> elements still work.
   ──────────────────────────────────────────────────────────────────────── */
.fas{display:inline-block;width:1em;height:1em;vertical-align:-0.125em;background-color:currentColor;
  -webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;
  -webkit-mask-size:contain;mask-size:contain;flex:none}
.fa-ban{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='4.9' y1='4.9' x2='19.1' y2='19.1'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='4.9' y1='4.9' x2='19.1' y2='19.1'/%3E%3C/svg%3E")}
.fa-bug{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='8' y='7' width='8' height='13' rx='4'/%3E%3Cpath d='M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5M9.5 7 8 4M14.5 7 16 4'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='8' y='7' width='8' height='13' rx='4'/%3E%3Cpath d='M8 11H4M20 11h-4M8 16H4.5M20 16h-3.5M9.5 7 8 4M14.5 7 16 4'/%3E%3C/svg%3E")}
.fa-building{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='2' width='16' height='20' rx='1'/%3E%3Cline x1='9' y1='7' x2='9' y2='7'/%3E%3Cline x1='15' y1='7' x2='15' y2='7'/%3E%3Cline x1='9' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='15' y2='12'/%3E%3Cpath d='M10 22v-4h4v4'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='4' y='2' width='16' height='20' rx='1'/%3E%3Cline x1='9' y1='7' x2='9' y2='7'/%3E%3Cline x1='15' y1='7' x2='15' y2='7'/%3E%3Cline x1='9' y1='12' x2='9' y2='12'/%3E%3Cline x1='15' y1='12' x2='15' y2='12'/%3E%3Cpath d='M10 22v-4h4v4'/%3E%3C/svg%3E")}
.fa-calendar-alt{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='4' width='18' height='18' rx='2'/%3E%3Cline x1='16' y1='2' x2='16' y2='6'/%3E%3Cline x1='8' y1='2' x2='8' y2='6'/%3E%3Cline x1='3' y1='10' x2='21' y2='10'/%3E%3C/svg%3E")}
.fa-chart-bar{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='20' x2='12' y2='10'/%3E%3Cline x1='18' y1='20' x2='18' y2='4'/%3E%3Cline x1='6' y1='20' x2='6' y2='16'/%3E%3Cline x1='3' y1='20' x2='21' y2='20'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='20' x2='12' y2='10'/%3E%3Cline x1='18' y1='20' x2='18' y2='4'/%3E%3Cline x1='6' y1='20' x2='6' y2='16'/%3E%3Cline x1='3' y1='20' x2='21' y2='20'/%3E%3C/svg%3E")}
.fa-chart-pie{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.2 15.9A10 10 0 1 1 8 2.8'/%3E%3Cpath d='M22 12A10 10 0 0 0 12 2v10z'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.2 15.9A10 10 0 1 1 8 2.8'/%3E%3Cpath d='M22 12A10 10 0 0 0 12 2v10z'/%3E%3C/svg%3E")}
.fa-check{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E")}
.fa-check-circle{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolyline points='16 9 11 15 8 12'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolyline points='16 9 11 15 8 12'/%3E%3C/svg%3E")}
.fa-circle-notch{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-6.2-8.6'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 12a9 9 0 1 1-6.2-8.6'/%3E%3C/svg%3E")}
.fa-clipboard-check{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='4' width='14' height='18' rx='2'/%3E%3Cpath d='M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1'/%3E%3Cpolyline points='9 13 11 15 15 11'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='5' y='4' width='14' height='18' rx='2'/%3E%3Cpath d='M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1'/%3E%3Cpolyline points='9 13 11 15 15 11'/%3E%3C/svg%3E")}
.fa-code-branch{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='6' y1='3' x2='6' y2='15'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cpath d='M18 9a9 9 0 0 1-9 9'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='6' y1='3' x2='6' y2='15'/%3E%3Ccircle cx='18' cy='6' r='3'/%3E%3Ccircle cx='6' cy='18' r='3'/%3E%3Cpath d='M18 9a9 9 0 0 1-9 9'/%3E%3C/svg%3E")}
.fa-cogs{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3.2'/%3E%3Cpath d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='3.2'/%3E%3Cpath d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.2 2.2M16.9 16.9l2.2 2.2M19.1 4.9l-2.2 2.2M7.1 16.9l-2.2 2.2'/%3E%3C/svg%3E")}
.fa-download{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='7 10 12 15 17 10'/%3E%3Cline x1='12' y1='15' x2='12' y2='3'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='7 10 12 15 17 10'/%3E%3Cline x1='12' y1='15' x2='12' y2='3'/%3E%3C/svg%3E")}
.fa-exclamation-triangle{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E")}
.fa-fire{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22a6 6 0 0 0 6-6c0-5-6-10-6-10S6 11 6 16a6 6 0 0 0 6 6z'/%3E%3Cpath d='M12 22a2.6 2.6 0 0 0 2.6-2.6c0-2-2.6-4.4-2.6-4.4s-2.6 2.4-2.6 4.4A2.6 2.6 0 0 0 12 22z'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22a6 6 0 0 0 6-6c0-5-6-10-6-10S6 11 6 16a6 6 0 0 0 6 6z'/%3E%3Cpath d='M12 22a2.6 2.6 0 0 0 2.6-2.6c0-2-2.6-4.4-2.6-4.4s-2.6 2.4-2.6 4.4A2.6 2.6 0 0 0 12 22z'/%3E%3C/svg%3E")}
.fa-flask{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 2v6.5L4.2 17A2 2 0 0 0 6 20h12a2 2 0 0 0 1.8-3L15 8.5V2'/%3E%3Cline x1='8.5' y1='2' x2='15.5' y2='2'/%3E%3Cline x1='7' y1='15' x2='17' y2='15'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 2v6.5L4.2 17A2 2 0 0 0 6 20h12a2 2 0 0 0 1.8-3L15 8.5V2'/%3E%3Cline x1='8.5' y1='2' x2='15.5' y2='2'/%3E%3Cline x1='7' y1='15' x2='17' y2='15'/%3E%3C/svg%3E")}
.fa-globe{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='2' y1='12' x2='22' y2='12'/%3E%3Cpath d='M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z'/%3E%3C/svg%3E")}
.fa-info-circle{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='16' x2='12' y2='11'/%3E%3Cline x1='12' y1='8' x2='12.01' y2='8'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='16' x2='12' y2='11'/%3E%3Cline x1='12' y1='8' x2='12.01' y2='8'/%3E%3C/svg%3E")}
.fa-layer-group{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 2 7 12 12 22 7 12 2'/%3E%3Cpolyline points='2 17 12 22 22 17'/%3E%3Cpolyline points='2 12 12 17 22 12'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolygon points='12 2 2 7 12 12 22 7 12 2'/%3E%3Cpolyline points='2 17 12 22 22 17'/%3E%3Cpolyline points='2 12 12 17 22 12'/%3E%3C/svg%3E")}
.fa-lightbulb{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6'/%3E%3Cpath d='M10 22h4'/%3E%3Cpath d='M15.1 14c.2-1 .7-1.7 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.8.8 1.2 1.5 1.4 2.5'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6'/%3E%3Cpath d='M10 22h4'/%3E%3Cpath d='M15.1 14c.2-1 .7-1.7 1.4-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.8.8 1.2 1.5 1.4 2.5'/%3E%3C/svg%3E")}
.fa-list-ul{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='9' y1='6' x2='21' y2='6'/%3E%3Cline x1='9' y1='12' x2='21' y2='12'/%3E%3Cline x1='9' y1='18' x2='21' y2='18'/%3E%3Cline x1='4' y1='6' x2='4.01' y2='6'/%3E%3Cline x1='4' y1='12' x2='4.01' y2='12'/%3E%3Cline x1='4' y1='18' x2='4.01' y2='18'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='9' y1='6' x2='21' y2='6'/%3E%3Cline x1='9' y1='12' x2='21' y2='12'/%3E%3Cline x1='9' y1='18' x2='21' y2='18'/%3E%3Cline x1='4' y1='6' x2='4.01' y2='6'/%3E%3Cline x1='4' y1='12' x2='4.01' y2='12'/%3E%3Cline x1='4' y1='18' x2='4.01' y2='18'/%3E%3C/svg%3E")}
.fa-pen{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'/%3E%3Cpath d='M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z'/%3E%3C/svg%3E")}
.fa-percent{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='19' y1='5' x2='5' y2='19'/%3E%3Ccircle cx='7' cy='7' r='2.5'/%3E%3Ccircle cx='17' cy='17' r='2.5'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='19' y1='5' x2='5' y2='19'/%3E%3Ccircle cx='7' cy='7' r='2.5'/%3E%3Ccircle cx='17' cy='17' r='2.5'/%3E%3C/svg%3E")}
.fa-plus{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'/%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'/%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3C/svg%3E")}
.fa-print{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 6 2 18 2 18 9'/%3E%3Cpath d='M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'/%3E%3Crect x='6' y='14' width='12' height='8'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 6 2 18 2 18 9'/%3E%3Cpath d='M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2'/%3E%3Crect x='6' y='14' width='12' height='8'/%3E%3C/svg%3E")}
.fa-table{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3Cline x1='3' y1='15' x2='21' y2='15'/%3E%3Cline x1='9' y1='3' x2='9' y2='21'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cline x1='3' y1='9' x2='21' y2='9'/%3E%3Cline x1='3' y1='15' x2='21' y2='15'/%3E%3Cline x1='9' y1='3' x2='9' y2='21'/%3E%3C/svg%3E")}
.fa-times-circle{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='15' y1='9' x2='9' y2='15'/%3E%3Cline x1='9' y1='9' x2='15' y2='15'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='15' y1='9' x2='9' y2='15'/%3E%3Cline x1='9' y1='9' x2='15' y2='15'/%3E%3C/svg%3E")}
.fa-trash{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 6 21 6'/%3E%3Cpath d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/%3E%3Cpath d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 6 21 6'/%3E%3Cpath d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/%3E%3Cpath d='M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/%3E%3C/svg%3E")}
.fa-user{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E")}
</style>
<style>
* { margin:0; padding:0; box-sizing:border-box; font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
body { background:#f4f7fc; padding:76px 24px 24px; color:#1a2634; }
.dashboard { max-width:1440px; margin:0 auto; }
.header { background:linear-gradient(135deg,#0b2a4a 0%,#1a3a5e 100%); border-radius:20px; padding:28px 36px;
  color:#fff; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:16px;
  margin-bottom:28px; box-shadow:0 8px 24px rgba(11,42,74,.25); }
.header-left h1 { font-size:26px; font-weight:700; letter-spacing:-.3px; }
.header-left h1 i { margin-right:12px; color:#6fc2f0; }
.header-left .sub { font-size:15px; opacity:.85; margin-top:6px; display:flex; gap:20px; flex-wrap:wrap; }
.header-left .sub span { display:inline-flex; align-items:center; gap:6px; }
.header-right { background:rgba(255,255,255,.12); padding:12px 22px; border-radius:40px; font-size:14px;
  display:flex; align-items:center; gap:14px; flex-wrap:wrap; }
.header-right .status-badge { background:#f5b342; color:#1a2634; font-weight:600; padding:4px 16px; border-radius:30px; font-size:13px; }
.kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:16px; margin-bottom:28px; }
.kpi-card { background:#fff; border-radius:16px; padding:20px 18px; box-shadow:0 2px 8px rgba(0,0,0,.05);
  border:1px solid #e9eef3; transition:.2s; }
.kpi-card:hover { transform:translateY(-2px); box-shadow:0 6px 18px rgba(0,0,0,.07); }
.kpi-label { font-size:12px; font-weight:600; color:#6f7d8c; letter-spacing:.3px; text-transform:uppercase;
  display:flex; align-items:center; gap:8px; }
.kpi-value { font-size:31px; font-weight:700; margin-top:6px; line-height:1.2; }
.kpi-value .small { font-size:15px; font-weight:400; color:#6f7d8c; margin-left:4px; }
.kpi-card.pass .kpi-value { color:#1e8e4a; }
.kpi-card.fail .kpi-value { color:#c73e3e; }
.kpi-card.blocked .kpi-value { color:#b97a1a; }
.kpi-card.total .kpi-value { color:#1a3a5e; }
.kpi-card.rate .kpi-value { color:#1a6b8a; }
.kpi-icon { font-size:17px; opacity:.6; }
.chart-grid { display:grid; grid-template-columns:1fr 1fr; gap:22px; margin-bottom:28px; }
@media (max-width:1000px){ .chart-grid { grid-template-columns:1fr; } }
.card { background:#fff; border-radius:18px; padding:22px; box-shadow:0 2px 8px rgba(0,0,0,.04); border:1px solid #e9eef3; }
.card-title { font-size:16px; font-weight:600; color:#1a2634; margin-bottom:14px; display:flex; align-items:center; gap:10px; }
.card-title i { color:#2a6b8a; font-size:17px; }
.chart-wrapper { position:relative; height:240px; }
.chart { width:100%; height:100%; }
.chart svg { width:100%; height:100%; display:block; overflow:visible; }
.chart .lg { display:flex; flex-wrap:wrap; gap:6px 14px; justify-content:center; font-size:12px; color:#41586b; }
.chart .lg i { width:11px; height:11px; border-radius:3px; display:inline-block; margin-right:5px; vertical-align:-1px; }
.chart .empty { display:flex; align-items:center; justify-content:center; height:100%; color:#8a9baa; font-size:13px; }
.chart-wrapper.tall { height:280px; }
.table-wrap { overflow-x:auto; }
table.data { width:100%; border-collapse:collapse; font-size:14px; }
table.data th { text-align:left; padding:10px 12px; background:#f0f4f9; color:#1f3a4e; font-weight:600;
  font-size:11.5px; text-transform:uppercase; letter-spacing:.4px; white-space:nowrap; }
table.data td { padding:10px 12px; border-bottom:1px solid #eef2f6; color:#1f2a36; vertical-align:top; }
table.data tr:last-child td { border-bottom:none; }
.tag { display:inline-block; padding:2px 12px; border-radius:30px; font-size:11.5px; font-weight:600; white-space:nowrap; }
.tag.green { background:#dff0e2; color:#1a6e3a; }
.tag.amber { background:#fef3d7; color:#8a6d1b; }
.tag.red { background:#fde8e8; color:#a33a3a; }
.tag.blue { background:#e1e9f5; color:#1f4a7a; }
.tag.purple { background:#efe4f7; color:#6b3f8a; }
.tag.grey { background:#eef1f4; color:#5b6b7a; }
.section { margin-bottom:28px; }
.footer { text-align:center; font-size:13px; color:#7a8b9b; margin-top:12px; padding:16px 0 4px; border-top:1px solid #e2e8ef; }
.fab-container { position:fixed; top:18px; right:24px; z-index:1000; display:flex; flex-wrap:wrap; justify-content:flex-end; gap:10px; }
.fab-btn { background:#1a3a5e; color:#fff; border:none; padding:10px 18px; border-radius:30px; font-size:13px;
  font-weight:600; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,.15); display:flex; align-items:center; gap:8px; transition:.2s; }
.fab-btn:hover { background:#0b2a4a; transform:translateY(-1px); }
.fab-btn.green { background:#1e8e4a; } .fab-btn.green:hover { background:#167a3e; }
.fab-btn.grey { background:#5b6b7a; } .fab-btn.grey:hover { background:#47555f; }
.edit-panel { display:none; background:#fff; border-radius:18px; padding:24px; border:1px solid #e9eef3;
  margin-bottom:28px; box-shadow:0 2px 8px rgba(0,0,0,.04); }
.edit-panel.active { display:block; }
.edit-section { margin-bottom:24px; }
.edit-section-title { font-size:15px; font-weight:600; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
.edit-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
@media (max-width:640px){ .edit-grid { grid-template-columns:1fr; } }
.edit-field { display:flex; flex-direction:column; gap:4px; }
.edit-field label { font-size:12px; font-weight:500; color:#6f7d8c; }
.edit-field input { padding:8px 10px; border:1px solid #d0d8e0; border-radius:8px; font-size:13px; outline:none; }
.edit-field input:focus { border-color:#1a3a5e; }
table.edit { width:100%; border-collapse:collapse; font-size:13px; }
table.edit th { text-align:left; padding:8px 10px; background:#f0f4f9; color:#1f3a4e; font-weight:600;
  font-size:11px; text-transform:uppercase; white-space:nowrap; }
table.edit td { padding:6px 8px; border-bottom:1px solid #eef2f6; }
table.edit input, table.edit select { width:100%; min-width:80px; padding:6px 8px; border:1px solid #d0d8e0;
  border-radius:6px; font-size:12px; background:#fff; }
table.edit input.num { width:64px; min-width:64px; text-align:center; }
.btn { padding:8px 14px; border-radius:8px; border:1px solid #d0d8e0; background:#fff; color:#1a2634;
  font-size:13px; font-weight:500; cursor:pointer; display:inline-flex; align-items:center; gap:6px; }
.btn:hover { background:#f0f4f9; }
.btn.primary { background:#1a3a5e; color:#fff; border-color:#1a3a5e; }
.btn.primary:hover { background:#0b2a4a; }
.btn.danger { color:#c73e3e; border-color:#e3bcbc; padding:6px 10px; }
.btn.danger:hover { background:#fde8e8; }
.edit-actions { display:flex; gap:10px; margin-top:14px; flex-wrap:wrap; }
.hint { font-size:12px; color:#7a8b9b; margin-top:10px; padding:10px 14px; background:#f8fafc;
  border-radius:8px; border:1px dashed #d0d8e0; }
.toast { position:fixed; bottom:24px; right:24px; background:#1e8e4a; color:#fff; padding:12px 20px;
  border-radius:10px; font-size:13px; font-weight:600; box-shadow:0 4px 16px rgba(30,142,74,.3);
  opacity:0; transform:translateY(20px); transition:.3s; pointer-events:none; z-index:2000; }
.toast.show { opacity:1; transform:translateY(0); }
.empty { padding:18px; text-align:center; color:#8a9baa; font-size:13px; }
@media print {
  body { background:#fff; padding:0; }
  .dashboard { max-width:none; }
  .fab-container, .edit-panel, .toast { display:none !important; }
  .card, .kpi-card { break-inside:avoid; box-shadow:none; }
}
@media (max-width:640px){
  .header { flex-direction:column; align-items:flex-start; padding:20px; }
  .kpi-grid { grid-template-columns:repeat(2,1fr); }
  .kpi-value { font-size:25px; }
  .fab-container { top:10px; right:10px; }
}
</style>
</head>
<body>

<div class="fab-container">
  <button class="fab-btn" id="editFab"><i class="fas fa-pen"></i> <span id="editFabText">Edit Mode</span></button>
  <button class="fab-btn green" id="downloadFab" title="Save an updated copy of this report"><i class="fas fa-download"></i> Download</button>
  <button class="fab-btn grey" id="printFab" title="Print or save as PDF"><i class="fas fa-print"></i> Print</button>
</div>

<div class="toast" id="toast"><i class="fas fa-check-circle"></i> Report updated</div>

<div class="dashboard">
  <div class="header">
    <div class="header-left">
      <h1><i class="fas fa-flask"></i> <span id="rptTitle"></span></h1>
      <div class="sub">
        <span id="wrapOrg"><i class="fas fa-building"></i> <span id="rptOrg"></span></span>
        <span><i class="fas fa-cogs"></i> <span id="rptSystem"></span></span>
        <span><i class="fas fa-globe"></i> <span id="rptEnv"></span></span>
        <span><i class="far fa-calendar-alt"></i> <span id="rptDates"></span></span>
      </div>
    </div>
    <div class="header-right">
      <i class="fas fa-clipboard-check"></i><span>Overall Status</span>
      <span class="status-badge" id="rptStatus"></span>
      <span style="opacity:.75"><i class="far fa-user"></i> <span id="rptEngineer"></span></span>
    </div>
  </div>

  <div class="edit-panel" id="editPanel">
    <div class="edit-section">
      <div class="edit-section-title"><i class="fas fa-info-circle"></i> Report Details</div>
      <div class="edit-grid">
        <div class="edit-field"><label>Title</label><input id="e_title"></div>
        <div class="edit-field"><label>Organization</label><input id="e_org"></div>
        <div class="edit-field"><label>System</label><input id="e_system"></div>
        <div class="edit-field"><label>Environment</label><input id="e_env"></div>
        <div class="edit-field"><label>Date Range</label><input id="e_range"></div>
        <div class="edit-field"><label>Overall Status</label><input id="e_status"></div>
        <div class="edit-field"><label>QA Engineer</label><input id="e_engineer"></div>
        <div class="edit-field"><label>Report Date</label><input id="e_rptdate"></div>
        <div class="edit-field"><label>Download file name</label><input id="e_filename"></div>
      </div>
    </div>

    <div class="edit-section">
      <div class="edit-section-title"><i class="fas fa-layer-group"></i> Modules / Services</div>
      <div class="table-wrap">
        <table class="edit">
          <thead><tr><th>Name</th><th>Total</th><th>Passed</th><th>Failed</th><th>Blocked</th><th>Status</th><th>Remarks</th><th></th></tr></thead>
          <tbody id="editSvcBody"></tbody>
        </table>
      </div>
      <div class="edit-actions"><button class="btn" id="addSvcBtn"><i class="fas fa-plus"></i> Add module</button></div>
    </div>

    <div class="edit-section">
      <div class="edit-section-title"><i class="fas fa-bug"></i> Defects</div>
      <div class="table-wrap">
        <table class="edit">
          <thead><tr><th>ID</th><th>Title</th><th>Module</th><th>Severity</th><th>Priority</th><th>Status</th><th>Test case</th><th>Assignee</th><th>Reported</th><th></th></tr></thead>
          <tbody id="editDefBody"></tbody>
        </table>
      </div>
      <div class="edit-actions"><button class="btn" id="addDefBtn"><i class="fas fa-plus"></i> Add defect</button></div>
    </div>

    <div class="edit-actions"><button class="btn primary" id="applyBtn"><i class="fas fa-check"></i> Apply &amp; close</button></div>
    <div class="hint"><i class="fas fa-lightbulb"></i> <strong>Tip:</strong> edits live in this file only. Click <strong>Download</strong> to save a copy that keeps them — the saved copy is still editable.</div>
  </div>

  <div class="kpi-grid" id="kpiGrid"></div>

  <div class="chart-grid">
    <div class="card"><div class="card-title"><i class="fas fa-chart-pie"></i> Test Execution Results</div>
      <div class="chart-wrapper"><div id="resultsPie" class="chart"></div></div></div>
    <div class="card"><div class="card-title"><i class="fas fa-exclamation-triangle"></i> Defects by Severity</div>
      <div class="chart-wrapper"><div id="severityBar" class="chart"></div></div></div>
  </div>

  <div class="chart-grid">
    <div class="card"><div class="card-title"><i class="fas fa-chart-bar"></i> Results by Module</div>
      <div class="chart-wrapper tall"><div id="serviceBar" class="chart"></div></div></div>
    <div class="card"><div class="card-title"><i class="fas fa-circle-notch"></i> Defect Status Breakdown</div>
      <div class="chart-wrapper tall"><div id="statusPie" class="chart"></div></div></div>
  </div>

  <div class="card section">
    <div class="card-title"><i class="fas fa-bug"></i> Defects by Module</div>
    <div class="chart-wrapper tall"><div id="moduleDefectBar" class="chart"></div></div>
  </div>

  <div class="card section">
    <div class="card-title"><i class="fas fa-table"></i> Module Results Overview</div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>Module / Service</th><th>Total TC</th><th>Passed</th><th>Failed</th><th>Blocked</th><th>Pass %</th><th>Defects</th><th>Open</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody id="svcBody"></tbody>
      </table>
    </div>
  </div>

  <div class="card section">
    <div class="card-title"><i class="fas fa-bug"></i> Defect Log</div>
    <div class="table-wrap">
      <table class="data">
        <thead><tr><th>#</th><th>ID</th><th>Title</th><th>Severity</th><th>Priority</th><th>Status</th><th>Test case</th><th>Assignee</th><th>Reported</th></tr></thead>
        <tbody id="defBody"></tbody>
      </table>
    </div>
  </div>

  <div class="footer">
    <i class="fas fa-code-branch"></i> QA Testing Report &middot; <span id="ftrSystem"></span> &middot;
    <i class="far fa-calendar-alt"></i> <span id="ftrDate"></span> &nbsp;|&nbsp;
    <i class="fas fa-bug"></i> <span id="ftrDefects"></span> defects reported
  </div>
</div>

<script>
/* __QA_DATA_START__ */ let DATA = __QA_REPORT_DATA__; /* __QA_DATA_END__ */

var meta = DATA.meta || {};
var services = DATA.services || [];
var defects = DATA.defects || [];

var SERVICE_STATUS = ['Not Started','In Progress','Blocked','Need Retest','Passed','Passed with minor issues','Passed with some issues'];
var PRIORITY = ['Critical','High','Medium','Low'];
var BUG_STATUS = ['Open','InProgress','ReadyForRetest','Reopened','Resolved','Closed','Rejected','Duplicate'];

var PRIORITY_COLORS = { Critical:'#b02a2a', High:'#d9534f', Medium:'#f0ad4e', Low:'#5bc0de' };
var STATUS_COLORS = { Open:'#d9534f', InProgress:'#9b59b6', ReadyForRetest:'#5bc0de', Reopened:'#e8743b',
  Resolved:'#1a6b8a', Closed:'#2a9d6e', Rejected:'#8a9baa', Duplicate:'#c4ccd3' };
var OPEN_STATUSES = ['Open','InProgress','ReadyForRetest','Reopened'];
var UNFILED = 'Unfiled';

/** Module names in report order, plus any a defect names that no module row has. */
function moduleNames() {
  var names = services.map(function (s) { return s.name || UNFILED; });
  defects.forEach(function (d) {
    var m = d.module || UNFILED;
    if (names.indexOf(m) === -1) names.push(m);
  });
  if (names.indexOf(UNFILED) === -1 && defects.some(function (d) { return !d.module; })) names.push(UNFILED);
  return names;
}
function defectsOf(moduleName) {
  return defects.filter(function (d) { return (d.module || UNFILED) === moduleName; });
}

var editMode = false;

/* ---------- helpers ---------- */
function label(v) { return v === 'InProgress' ? 'In Progress' : (v === 'ReadyForRetest' ? 'Ready For Retest' : (v || '')); }
function num(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
function td(tr, text) { var c = document.createElement('td'); c.textContent = text == null ? '' : String(text); tr.appendChild(c); return c; }
function tdNode(tr, node) { var c = document.createElement('td'); if (node) c.appendChild(node); tr.appendChild(c); return c; }
function tagFor(text, tone) { var s = document.createElement('span'); s.className = 'tag ' + tone; s.textContent = text; return s; }

function serviceTone(status) {
  var s = (status || '').toLowerCase();
  if (s === 'passed') return 'green';
  if (s.indexOf('minor') > -1) return 'amber';
  if (s.indexOf('some') > -1) return 'red';
  if (s === 'blocked') return 'red';
  if (s === 'in progress') return 'blue';
  if (s === 'need retest') return 'purple';
  return 'grey';
}
function bugTone(status) {
  if (status === 'Closed' || status === 'Resolved') return 'green';
  if (status === 'Open' || status === 'Reopened') return 'red';
  if (status === 'InProgress') return 'purple';
  if (status === 'ReadyForRetest') return 'blue';
  return 'grey';
}
function priorityTone(p) {
  if (p === 'Critical' || p === 'High') return 'red';
  if (p === 'Medium') return 'amber';
  return 'blue';
}

/* ---------- form controls: DOM nodes, never HTML strings, so a bug title
     containing markup can never become markup ---------- */
function textInput(value, onChange, cls, type) {
  var i = document.createElement('input');
  if (type) i.type = type;
  if (cls) i.className = cls;
  i.value = value == null ? '' : value;
  i.addEventListener('change', function () { onChange(i.value); });
  return i;
}
function selectInput(options, value, onChange) {
  var s = document.createElement('select');
  options.forEach(function (o) {
    var op = document.createElement('option');
    op.value = o; op.textContent = label(o);
    if (o === value) op.selected = true;
    s.appendChild(op);
  });
  s.addEventListener('change', function () { onChange(s.value); });
  return s;
}
function deleteButton(onClick) {
  var b = document.createElement('button');
  b.className = 'btn danger';
  b.innerHTML = '<i class="fas fa-trash"></i>';
  b.addEventListener('click', onClick);
  return b;
}

/* ---------- edit panel ---------- */
function populateEditFields() {
  document.getElementById('e_title').value = meta.title || '';
  document.getElementById('e_org').value = meta.org || '';
  document.getElementById('e_system').value = meta.system || '';
  document.getElementById('e_env').value = meta.environment || '';
  document.getElementById('e_range').value = meta.dateRange || '';
  document.getElementById('e_status').value = meta.overallStatus || '';
  document.getElementById('e_engineer').value = meta.engineer || '';
  document.getElementById('e_rptdate').value = meta.reportDate || '';
  document.getElementById('e_filename').value = meta.fileName || 'QA-Testing-Report';
  renderEditServices();
  renderEditDefects();
}
function syncMetaFromForm() {
  if (!document.getElementById('e_title')) return;
  meta.title = document.getElementById('e_title').value;
  meta.org = document.getElementById('e_org').value;
  meta.system = document.getElementById('e_system').value;
  meta.environment = document.getElementById('e_env').value;
  meta.dateRange = document.getElementById('e_range').value;
  meta.overallStatus = document.getElementById('e_status').value;
  meta.engineer = document.getElementById('e_engineer').value;
  meta.reportDate = document.getElementById('e_rptdate').value;
  meta.fileName = document.getElementById('e_filename').value;
}

function renderEditServices() {
  var body = document.getElementById('editSvcBody');
  body.innerHTML = '';
  services.forEach(function (s, i) {
    var tr = document.createElement('tr');
    tdNode(tr, textInput(s.name, function (v) { s.name = v; }));
    tdNode(tr, textInput(s.total, function (v) { s.total = num(v); }, 'num', 'number'));
    tdNode(tr, textInput(s.passed, function (v) { s.passed = num(v); }, 'num', 'number'));
    tdNode(tr, textInput(s.failed, function (v) { s.failed = num(v); }, 'num', 'number'));
    tdNode(tr, textInput(s.blocked, function (v) { s.blocked = num(v); }, 'num', 'number'));
    tdNode(tr, selectInput(SERVICE_STATUS, s.status, function (v) { s.status = v; }));
    tdNode(tr, textInput(s.remarks, function (v) { s.remarks = v; }));
    tdNode(tr, deleteButton(function () { services.splice(i, 1); renderEditServices(); }));
    body.appendChild(tr);
  });
  if (!services.length) {
    var tr2 = document.createElement('tr');
    var c = td(tr2, 'No modules yet — add one.');
    c.colSpan = 8; c.className = 'empty';
    body.appendChild(tr2);
  }
}

function renderEditDefects() {
  var body = document.getElementById('editDefBody');
  body.innerHTML = '';
  defects.forEach(function (d, i) {
    var tr = document.createElement('tr');
    tdNode(tr, textInput(d.key, function (v) { d.key = v; }));
    tdNode(tr, textInput(d.title, function (v) { d.title = v; }));
    // Options are the module rows above, so re-filing a defect and the table it
    // will be counted in cannot drift apart. A module the file no longer has is
    // kept as its own option rather than silently reset.
    var moduleOptions = services.map(function (s) { return s.name || UNFILED; });
    if (moduleOptions.indexOf(UNFILED) === -1) moduleOptions.push(UNFILED);
    var current = d.module || UNFILED;
    if (moduleOptions.indexOf(current) === -1) moduleOptions.push(current);
    tdNode(tr, selectInput(moduleOptions, current, function (v) { d.module = v; }));
    tdNode(tr, selectInput(PRIORITY, d.severity, function (v) { d.severity = v; }));
    tdNode(tr, selectInput(PRIORITY, d.priority, function (v) { d.priority = v; }));
    tdNode(tr, selectInput(BUG_STATUS, d.status, function (v) { d.status = v; }));
    tdNode(tr, textInput(d.area, function (v) { d.area = v; }));
    tdNode(tr, textInput(d.assignedTo, function (v) { d.assignedTo = v; }));
    tdNode(tr, textInput(d.reportedOn, function (v) { d.reportedOn = v; }));
    tdNode(tr, deleteButton(function () { defects.splice(i, 1); renderEditDefects(); }));
    body.appendChild(tr);
  });
  if (!defects.length) {
    var tr2 = document.createElement('tr');
    var c = td(tr2, 'No defects yet — add one.');
    c.colSpan = 10; c.className = 'empty';
    body.appendChild(tr2);
  }
}

/* ---------- dashboard ---------- */
function totals() {
  var t = { total: 0, passed: 0, failed: 0, blocked: 0 };
  services.forEach(function (s) {
    t.total += num(s.total); t.passed += num(s.passed);
    t.failed += num(s.failed); t.blocked += num(s.blocked);
  });
  t.notRun = Math.max(0, t.total - t.passed - t.failed - t.blocked);
  t.rate = t.total > 0 ? ((t.passed / t.total) * 100).toFixed(1) : '0.0';
  return t;
}

function renderKpis() {
  var t = totals();
  var open = defects.filter(function (d) { return OPEN_STATUSES.indexOf(d.status) > -1; }).length;
  var critical = defects.filter(function (d) { return d.severity === 'Critical' || d.severity === 'High'; }).length;
  var cards = [
    { cls: 'total', icon: 'fa-layer-group', label: 'Modules', value: String(services.length) },
    { cls: 'total', icon: 'fa-list-ul', label: 'Total Test Cases', value: String(t.total) },
    { cls: 'pass', icon: 'fa-check-circle', label: 'Passed', value: t.passed + ' <span class="small">/ ' + t.total + '</span>' },
    { cls: 'fail', icon: 'fa-times-circle', label: 'Failed', value: String(t.failed) },
    { cls: 'blocked', icon: 'fa-ban', label: 'Blocked', value: String(t.blocked) },
    { cls: 'rate', icon: 'fa-percent', label: 'Pass Rate', value: t.rate + '<span class="small">%</span>' },
    { cls: 'total', icon: 'fa-bug', label: 'Total Defects', value: String(defects.length) },
    { cls: 'fail', icon: 'fa-fire', label: 'Open / High+', value: open + ' <span class="small">/ ' + critical + '</span>' }
  ];
  var grid = document.getElementById('kpiGrid');
  grid.innerHTML = '';
  cards.forEach(function (c) {
    var d = document.createElement('div');
    d.className = 'kpi-card ' + c.cls;
    var l = document.createElement('div');
    l.className = 'kpi-label';
    l.innerHTML = '<i class="fas ' + c.icon + ' kpi-icon"></i>';
    l.appendChild(document.createTextNode(' ' + c.label));
    var v = document.createElement('div');
    v.className = 'kpi-value';
    v.innerHTML = c.value;
    d.appendChild(l); d.appendChild(v);
    grid.appendChild(d);
  });
}

function renderServiceTable() {
  var body = document.getElementById('svcBody');
  body.innerHTML = '';
  services.forEach(function (s) {
    var tr = document.createElement('tr');
    var nameCell = td(tr, '');
    var strong = document.createElement('strong');
    strong.textContent = s.name || '—';
    nameCell.appendChild(strong);
    td(tr, num(s.total)); td(tr, num(s.passed)); td(tr, num(s.failed)); td(tr, num(s.blocked));
    td(tr, (num(s.total) > 0 ? Math.round((num(s.passed) / num(s.total)) * 100) : 0) + '%');
    // Counted from the defect log rather than stored on the row, so re-filing a
    // defect in the edit panel moves its count here in the same click — there is
    // no second number that can drift out of agreement with the log.
    var mine = defectsOf(s.name || UNFILED);
    var open = mine.filter(function (d) { return OPEN_STATUSES.indexOf(d.status) > -1; }).length;
    td(tr, mine.length);
    var openCell = td(tr, open);
    if (open > 0) { openCell.style.color = '#c73e3e'; openCell.style.fontWeight = '700'; }
    tdNode(tr, tagFor(s.status || '—', serviceTone(s.status)));
    td(tr, s.remarks || '—');
    body.appendChild(tr);
  });
  if (!services.length) {
    var tr2 = document.createElement('tr');
    var c = td(tr2, 'No modules recorded.'); c.colSpan = 10; c.className = 'empty';
    body.appendChild(tr2);
  }
}

/**
 * The defect log, grouped under the module each defect is filed against.
 *
 * A flat list of forty defects tells a reader nothing about where the system is
 * weak; the same forty under six headings does. Numbering stays continuous
 * across groups so "defect 23" means one thing in the whole document.
 */
function renderDefectTable() {
  var body = document.getElementById('defBody');
  body.innerHTML = '';

  if (!defects.length) {
    var empty = document.createElement('tr');
    var c = td(empty, 'No defects recorded.'); c.colSpan = 9; c.className = 'empty';
    body.appendChild(empty);
    return;
  }

  var n = 0;
  moduleNames().forEach(function (moduleName) {
    var rows = defectsOf(moduleName);
    if (!rows.length) return;

    var open = rows.filter(function (d) { return OPEN_STATUSES.indexOf(d.status) > -1; }).length;
    var head = document.createElement('tr');
    var hc = document.createElement('td');
    hc.colSpan = 9;
    hc.style.cssText = 'background:#f0f4f9;font-weight:700;color:#1f3a4e;font-size:12.5px;padding:8px 12px;';
    hc.textContent = moduleName + '  ·  ' + rows.length + ' defect' + (rows.length === 1 ? '' : 's') +
      (open ? ', ' + open + ' open' : '');
    head.appendChild(hc);
    body.appendChild(head);

    rows.forEach(function (d) {
      n += 1;
      var tr = document.createElement('tr');
      td(tr, n);
      td(tr, d.key || '—');
      td(tr, d.title || '—');
      tdNode(tr, tagFor(d.severity || '—', priorityTone(d.severity)));
      tdNode(tr, tagFor(d.priority || '—', priorityTone(d.priority)));
      tdNode(tr, tagFor(label(d.status) || '—', bugTone(d.status)));
      td(tr, d.area || '—');
      td(tr, d.assignedTo || '—');
      td(tr, d.reportedOn || '—');
      body.appendChild(tr);
    });
  });
}

function countBy(list, key) {
  var map = {};
  list.forEach(function (item) { var k = item[key] || 'Unspecified'; map[k] = (map[k] || 0) + 1; });
  return map;
}
/** Known values first, in their canonical order; anything unexpected appended. */
function orderedKeys(counts, canonical) {
  var keys = canonical.filter(function (k) { return counts[k]; });
  Object.keys(counts).forEach(function (k) { if (keys.indexOf(k) === -1) keys.push(k); });
  return keys;
}


/* ── Charts ────────────────────────────────────────────────────────────────
   Drawn as inline SVG rather than pulled from a CDN. The report is meant to be
   downloaded, edited offline and forwarded; loading Chart.js over the network
   meant that on the machine it was actually read on, the charts were blank.

   SVG rather than canvas so the Print button produces a PDF with sharp charts
   at any zoom, and so a chart survives being saved into the edited copy.
   Values are exposed through <title>, which browsers show natively on hover —
   the tooltips are not lost with the library.
   ──────────────────────────────────────────────────────────────────────── */
var SVGNS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs) {
  var el = document.createElementNS(SVGNS, name);
  for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) el.setAttribute(k, String(attrs[k]));
  return el;
}

function chartHost(id) {
  var host = document.getElementById(id);
  if (host) host.innerHTML = '';
  return host;
}

function emptyChart(host, message) {
  var d = document.createElement('div');
  d.className = 'empty';
  d.textContent = message || 'No data yet';
  host.appendChild(d);
}

/** Shared colour swatch legend, drawn as HTML so it wraps like text. */
function legendFor(host, items, place) {
  var lg = document.createElement('div');
  lg.className = 'lg';
  lg.style.margin = place === 'top' ? '0 0 8px' : '8px 0 0';
  items.forEach(function (it) {
    var span = document.createElement('span');
    var sw = document.createElement('i');
    sw.style.background = it.color;
    span.appendChild(sw);
    span.appendChild(document.createTextNode(it.label));
    lg.appendChild(span);
  });
  if (place === 'top') host.appendChild(lg); else host.appendChild(lg);
  return lg;
}

/** Pie / doughnut. 'donut' is the inner radius as a fraction of the outer. */
function renderPie(id, items, donut) {
  var host = chartHost(id);
  if (!host) return;
  items = (items || []).filter(function (i) { return num(i.value) > 0; });
  var total = items.reduce(function (a, i) { return a + num(i.value); }, 0);
  if (total <= 0) { emptyChart(host, 'Nothing to chart yet'); return; }

  var box = document.createElement('div');
  box.style.cssText = 'flex:1;min-height:0';
  host.style.cssText = 'display:flex;flex-direction:column;height:100%';
  host.appendChild(box);

  var size = 100, cx = 50, cy = 50, r = 44, ri = donut ? r * donut : 0;
  var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, preserveAspectRatio: 'xMidYMid meet' });

  var angle = -Math.PI / 2; // start at 12 o'clock
  items.forEach(function (it) {
    var frac = num(it.value) / total;
    var end = angle + frac * Math.PI * 2;
    // A full-circle slice cannot be drawn as an arc (start === end), so it is
    // rendered as a ring/disc instead of silently disappearing.
    var node;
    if (frac >= 0.9999) {
      node = svgEl('circle', { cx: cx, cy: cy, r: (r + ri) / 2, fill: 'none',
        stroke: it.color, 'stroke-width': r - ri });
      if (!donut) node = svgEl('circle', { cx: cx, cy: cy, r: r, fill: it.color });
    } else {
      var large = end - angle > Math.PI ? 1 : 0;
      var x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
      var x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      var d;
      if (ri > 0) {
        var xi2 = cx + ri * Math.cos(end), yi2 = cy + ri * Math.sin(end);
        var xi1 = cx + ri * Math.cos(angle), yi1 = cy + ri * Math.sin(angle);
        d = 'M' + x1 + ' ' + y1 + 'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 +
            'L' + xi2 + ' ' + yi2 + 'A' + ri + ' ' + ri + ' 0 ' + large + ' 0 ' + xi1 + ' ' + yi1 + 'Z';
      } else {
        d = 'M' + cx + ' ' + cy + 'L' + x1 + ' ' + y1 +
            'A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + 'Z';
      }
      node = svgEl('path', { d: d, fill: it.color, stroke: '#fff', 'stroke-width': 1 });
    }
    var title = svgEl('title');
    title.textContent = it.label + ': ' + num(it.value) + ' (' + Math.round(frac * 100) + '%)';
    node.appendChild(title);
    svg.appendChild(node);
    angle = end;
  });

  box.appendChild(svg);
  legendFor(host, items, 'bottom');
}

/**
 * Bars. 'series' is [{label, color, data:[]}]; several series draw grouped, or
 * stacked when 'stacked' is set. One series with 'colors' paints per bar.
 */
function renderBars(id, labels, series, opts) {
  opts = opts || {};
  var host = chartHost(id);
  if (!host) return;
  labels = labels || [];
  var hasData = labels.length > 0 && series.some(function (s) {
    return (s.data || []).some(function (v) { return num(v) > 0; });
  });
  if (!hasData) { emptyChart(host, 'Nothing to chart yet'); return; }

  host.style.cssText = 'display:flex;flex-direction:column;height:100%';
  if (opts.legend && series.length > 1) legendFor(host, series, 'top');
  var box = document.createElement('div');
  box.style.cssText = 'flex:1;min-height:0';
  host.appendChild(box);

  // Aspect close to the cards these sit in, and scaled with 'meet' below so
  // nothing is distorted: stretching the SVG to fill the width also stretches
  // the axis labels, which reads as a rendering fault.
  var W = 400, H = 180, padL = 26, padR = 6, padB = 30, padT = 8;
  var plotW = W - padL - padR, plotH = H - padT - padB;

  var maxVal = 0;
  labels.forEach(function (_, i) {
    if (opts.stacked) {
      var sum = series.reduce(function (a, s) { return a + num((s.data || [])[i]); }, 0);
      if (sum > maxVal) maxVal = sum;
    } else {
      series.forEach(function (s) { var v = num((s.data || [])[i]); if (v > maxVal) maxVal = v; });
    }
  });
  if (maxVal <= 0) maxVal = 1;
  // Round the axis up to a whole number of ticks so labels stay integers —
  // defect counts have no meaningful halves.
  var ticks = Math.min(5, Math.max(2, maxVal));
  var step = Math.ceil(maxVal / ticks);
  var top = step * ticks;

  var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet' });

  for (var t = 0; t <= ticks; t++) {
    var val = step * t;
    var y = padT + plotH - (val / top) * plotH;
    svg.appendChild(svgEl('line', { x1: padL, y1: y, x2: W - padR, y2: y, stroke: '#eef2f6', 'stroke-width': 1 }));
    var lbl = svgEl('text', { x: padL - 5, y: y + 3, 'text-anchor': 'end', 'font-size': 8, fill: '#8a9baa' });
    lbl.textContent = String(val);
    svg.appendChild(lbl);
  }

  var slot = plotW / labels.length;
  // Capped, so one or two categories give normal-looking bars instead of a
  // slab the width of the card.
  var groupW = Math.min(slot * 0.68, opts.stacked ? 56 : 26 * series.length);
  var barW = opts.stacked ? groupW : groupW / series.length;

  labels.forEach(function (label, i) {
    var x0 = padL + slot * i + (slot - groupW) / 2;
    var stackY = padT + plotH;

    series.forEach(function (s, si) {
      var v = num((s.data || [])[i]);
      if (v <= 0) return;
      var h = (v / top) * plotH;
      var x = opts.stacked ? x0 : x0 + barW * si;
      var y = opts.stacked ? (stackY - h) : (padT + plotH - h);
      if (opts.stacked) stackY -= h;
      var color = (opts.colors && opts.colors[i]) || s.color;
      var rect = svgEl('rect', { x: x, y: y, width: Math.max(barW - 1, 1), height: Math.max(h, 0.5),
        fill: color, rx: 2 });
      var title = svgEl('title');
      title.textContent = (series.length > 1 ? s.label + ' — ' : '') + label + ': ' + v;
      rect.appendChild(title);
      svg.appendChild(rect);
    });

    var short = label.length > 12 ? label.slice(0, 11) + '…' : label;
    var tx = svgEl('text', { x: padL + slot * i + slot / 2, y: H - padB + 12,
      'text-anchor': 'middle', 'font-size': 8, fill: '#5b6f80' });
    tx.textContent = short;
    var full = svgEl('title');
    full.textContent = label;
    tx.appendChild(full);
    svg.appendChild(tx);
  });

  svg.appendChild(svgEl('line', { x1: padL, y1: padT + plotH, x2: W - padR, y2: padT + plotH,
    stroke: '#d6dee6', 'stroke-width': 1 }));

  box.appendChild(svg);
}

function renderCharts() {
  var t = totals();

  renderPie('resultsPie', [
    { label: 'Passed', value: t.passed, color: '#2a9d6e' },
    { label: 'Failed', value: t.failed, color: '#d9534f' },
    { label: 'Blocked', value: t.blocked, color: '#f0ad4e' },
    { label: 'Not executed', value: t.notRun, color: '#c4ccd3' }
  ], 0.62);

  var sev = countBy(defects, 'severity');
  var sevLabels = orderedKeys(sev, PRIORITY);
  renderBars('severityBar', sevLabels,
    [{ label: 'Defects', color: '#8a9baa', data: sevLabels.map(function (l) { return sev[l]; }) }],
    { colors: sevLabels.map(function (l) { return PRIORITY_COLORS[l] || '#8a9baa'; }) });

  var top = services.slice().sort(function (a, b) { return num(b.total) - num(a.total); }).slice(0, 12);
  renderBars('serviceBar', top.map(function (s) { return s.name || '—'; }), [
    { label: 'Passed', color: '#2a9d6e', data: top.map(function (s) { return num(s.passed); }) },
    { label: 'Failed', color: '#d9534f', data: top.map(function (s) { return num(s.failed); }) },
    { label: 'Blocked', color: '#f0ad4e', data: top.map(function (s) { return num(s.blocked); }) }
  ], { legend: true });

  // Defects per module, split by severity. Stacked rather than grouped because
  // the question is "which module carries the most defect weight", and the
  // severity split answers "and how bad are they" inside the same bar.
  var modules = moduleNames().filter(function (m) { return defectsOf(m).length > 0; });
  renderBars('moduleDefectBar', modules, PRIORITY.map(function (pr) {
    return {
      label: pr,
      color: PRIORITY_COLORS[pr],
      data: modules.map(function (m) {
        return defectsOf(m).filter(function (d) { return d.severity === pr; }).length;
      })
    };
  }), { stacked: true, legend: true });

  var st = countBy(defects, 'status');
  var stLabels = orderedKeys(st, BUG_STATUS);
  renderPie('statusPie', stLabels.map(function (l) {
    return { label: label(l), value: st[l], color: STATUS_COLORS[l] || '#8a9baa' };
  }), 0);
}

function renderDashboard() {
  document.title = meta.title || 'QA Testing Report';
  document.getElementById('rptTitle').textContent = meta.title || 'QA Testing Report';
  document.getElementById('rptOrg').textContent = meta.org || '';
  document.getElementById('wrapOrg').style.display = meta.org ? '' : 'none';
  document.getElementById('rptSystem').textContent = meta.system || '';
  document.getElementById('rptEnv').textContent = meta.environment || '';
  document.getElementById('rptDates').textContent = meta.dateRange || '';
  document.getElementById('rptStatus').textContent = meta.overallStatus || 'In Progress';
  document.getElementById('rptEngineer').textContent = meta.engineer || '';
  document.getElementById('ftrSystem').textContent = meta.system || '';
  document.getElementById('ftrDate').textContent = meta.reportDate || '';
  document.getElementById('ftrDefects').textContent = String(defects.length);
  renderKpis();
  renderServiceTable();
  renderDefectTable();
  renderCharts();
}

/* ---------- actions ---------- */
function showToast() {
  var t = document.getElementById('toast');
  t.classList.add('show');
  setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function toggleEdit() {
  if (!editMode) {
    editMode = true;
    document.getElementById('editPanel').classList.add('active');
    document.getElementById('editFabText').textContent = 'Close Edit';
    populateEditFields();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    applyEdits();
  }
}
function applyEdits() {
  syncMetaFromForm();
  renderDashboard();
  editMode = false;
  document.getElementById('editPanel').classList.remove('active');
  document.getElementById('editFabText').textContent = 'Edit Mode';
  showToast();
}
function safeName(name) {
  var n = String(name || 'QA-Testing-Report').replace(/[\\/:*?"<>|#%]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return n || 'QA-Testing-Report';
}
/**
 * Save an updated copy of THIS file. The data block is swapped between its two
 * markers rather than by regex over the whole document, so a bug title that
 * happens to contain "let DATA = {" cannot corrupt the saved copy.
 */
function downloadHTML() {
  syncMetaFromForm();
  var payload = JSON.stringify({ meta: meta, services: services, defects: defects }).replace(/</g, '\\u003c');
  var html = document.documentElement.outerHTML;
  var startMark = '/* __QA_DATA_START__ */';
  var endMark = '/* __QA_DATA_END__ */';
  var start = html.indexOf(startMark);
  var end = html.indexOf(endMark);
  if (start > -1 && end > start) {
    html = html.slice(0, start) + startMark + ' let DATA = ' + payload + '; ' + html.slice(end);
  }
  var blob = new Blob(['<!DOCTYPE html>\n' + html], { type: 'text/html;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = safeName(meta.fileName) + '.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
}

document.getElementById('editFab').addEventListener('click', toggleEdit);
document.getElementById('applyBtn').addEventListener('click', applyEdits);
document.getElementById('downloadFab').addEventListener('click', downloadHTML);
document.getElementById('printFab').addEventListener('click', function () { window.print(); });
document.getElementById('addSvcBtn').addEventListener('click', function () {
  services.push({ name: 'New module', total: 0, passed: 0, failed: 0, blocked: 0, status: 'Not Started', remarks: '' });
  renderEditServices();
});
document.getElementById('addDefBtn').addEventListener('click', function () {
  defects.push({ key: '', title: 'New defect', module: (services[0] && services[0].name) || UNFILED, severity: 'Medium', priority: 'Medium', status: 'Open', area: '', assignedTo: '', reportedOn: '' });
  renderEditDefects();
});

renderDashboard();
</script>
</body>
</html>
`
