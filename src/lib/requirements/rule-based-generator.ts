import type { ParsedRequirementItem } from "./parsers"

export type GenerationMode = "conservative" | "balanced" | "detailed"
export type OutputLanguage = "source" | "en" | "ar"

export interface GeneratedTestCaseFromReq {
  title: string
  description: string
  module?: string
  feature?: string
  component?: string
  priority: "Low" | "Medium" | "High" | "Critical"
  preconditions: string
  testData?: Record<string, string>
  steps: GeneratedStepFromReq[]
  source: "RequirementFile"
  requirementKey?: string
  testType: "Positive" | "Negative" | "Boundary" | "Validation" | "Permission" | "ErrorHandling"
  language: "en" | "ar"
  tags: string[]
}

export interface GeneratedStepFromReq {
  stepNumber: number
  actionDescription: string
  expectedResult: string
  actualResult: string
  actionType: string
  targetType: string
  targetValue: string
  inputValue: string
  timeoutMs: number
}

// ─── Language Helpers ─────────────────────────────────────────────────────────

function isArabic(text: string): boolean {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length
  const totalAlpha = (text.match(/[a-zA-Z\u0600-\u06FF]/g) || []).length
  return totalAlpha > 0 && arabicChars / totalAlpha > 0.4
}

function resolveLanguage(req: ParsedRequirementItem, outputLang: OutputLanguage): "en" | "ar" {
  if (outputLang === "en") return "en"
  if (outputLang === "ar") return "ar"
  // source language
  const lang = req.language
  if (lang === "Arabic") return "ar"
  const textToCheck = `${req.title} ${req.description || ""}`
  return isArabic(textToCheck) ? "ar" : "en"
}

// ─── Priority Normalizer ──────────────────────────────────────────────────────

function normalizePriority(p?: string): "Low" | "Medium" | "High" | "Critical" {
  if (!p) return "Medium"
  const lower = p.toLowerCase()
  if (lower.includes("critical") || lower.includes("حرج")) return "Critical"
  if (lower.includes("high") || lower.includes("عالي")) return "High"
  if (lower.includes("low") || lower.includes("منخفض")) return "Low"
  return "Medium"
}

// ─── Step Builder ──────────────────────────────────────────────────────────────

function step(n: number, action: string, expected: string, aType = "custom_instruction"): GeneratedStepFromReq {
  return {
    stepNumber: n,
    actionDescription: action,
    expectedResult: expected,
    actualResult: "",
    actionType: aType,
    targetType: "none",
    targetValue: "",
    inputValue: "",
    timeoutMs: 10000,
  }
}

// ─── Core Generator for English ──────────────────────────────────────────────

function generateEnglish(
  req: ParsedRequirementItem,
  mode: GenerationMode
): Omit<GeneratedTestCaseFromReq, "language">[] {
  const title = req.title.trim()
  const description = req.description || title
  const priority = normalizePriority(req.priority)
  const module = req.module || "General"
  const feature = req.feature
  const component = req.component
  const reqKey = req.requirementKey
  const acList = (req.acceptanceCriteria || []).filter(Boolean)

  const cases: Omit<GeneratedTestCaseFromReq, "language">[] = []

  // ── Positive ──────────────────────────────────────────────────────────────
  const positiveSteps: GeneratedStepFromReq[] = [
    step(1, `Navigate to the page where "${title}" is available`, "The page loads successfully with all required elements visible"),
    step(2, `Provide valid inputs and data required for: ${description.substring(0, 120)}`, "All input fields accept the provided data without validation errors"),
    step(3, "Perform the main action (submit / confirm / proceed)", "The action completes successfully"),
    step(4, "Verify the success outcome and system response", acList.length > 0 ? acList[0] : `System responds as expected for: ${title}`),
  ]
  if (acList.length > 1) {
    acList.slice(1, 3).forEach((ac, i) => {
      positiveSteps.push(step(5 + i, "Verify additional acceptance criterion", ac))
    })
  }

  cases.push({
    title: `Verify ${title} with valid inputs`,
    description: `Ensure the system handles "${description.substring(0, 200)}" correctly under normal conditions.`,
    module, feature, component, priority,
    preconditions: "User is authenticated. System is in a stable state. Required data is available.",
    steps: positiveSteps,
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Positive",
    tags: ["positive", "smoke"],
  })

  if (mode === "conservative") return cases

  // ── Negative ──────────────────────────────────────────────────────────────
  cases.push({
    title: `Verify ${title} fails gracefully with invalid inputs`,
    description: `Ensure the system shows appropriate error messages when invalid data is provided for: ${title}`,
    module, feature, component, priority,
    preconditions: "User is authenticated. System is in a stable state.",
    steps: [
      step(1, `Navigate to the page where "${title}" is available`, "The page loads successfully"),
      step(2, "Leave required fields empty and attempt to submit", "Validation error messages are displayed for required fields"),
      step(3, "Enter invalid format data (e.g., special characters, out-of-range values)", "Field-level validation messages are shown"),
      step(4, "Confirm the action is blocked and system remains stable", "No unintended changes occur. User remains on the same page."),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Negative",
    tags: ["negative", "validation"],
  })

  // ── Validation ────────────────────────────────────────────────────────────
  cases.push({
    title: `Verify field validations for ${title}`,
    description: `Validate all required field constraints and business rules for: ${title}`,
    module, feature, component, priority: "Medium",
    preconditions: "User is on the relevant form or page.",
    steps: [
      step(1, "Identify all required fields on the form/page", "All required fields are clearly marked"),
      step(2, "Submit the form without filling any required field", "System shows validation error per required field"),
      step(3, "Enter data exceeding maximum length limits", "System truncates or rejects oversized input"),
      step(4, "Enter data in wrong format (e.g., text in number field, invalid email)", "System shows clear format validation message"),
      step(5, "Enter boundary values (minimum and maximum valid values)", "System accepts minimum and maximum boundary values"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Validation",
    tags: ["validation", "boundary"],
  })

  if (mode === "balanced") return cases

  // ── Boundary ──────────────────────────────────────────────────────────────
  cases.push({
    title: `Verify boundary conditions for ${title}`,
    description: `Test edge values and boundary conditions related to: ${title}`,
    module, feature, component, priority: "Medium",
    preconditions: "User is authenticated. System is accessible.",
    steps: [
      step(1, "Test with the minimum allowed value or the first valid option", "System accepts minimum boundary and processes correctly"),
      step(2, "Test with the maximum allowed value or the last valid option", "System accepts maximum boundary and processes correctly"),
      step(3, "Test with a value just below the minimum (out-of-range)", "System rejects value and shows appropriate error"),
      step(4, "Test with a value just above the maximum (out-of-range)", "System rejects value and shows appropriate error"),
      step(5, "Test with exactly the boundary value", "System processes the exact boundary value correctly"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Boundary",
    tags: ["boundary", "edge-case"],
  })

  // ── Error Handling ────────────────────────────────────────────────────────
  cases.push({
    title: `Verify error handling for ${title}`,
    description: `Ensure the system handles errors gracefully and provides actionable feedback for: ${title}`,
    module, feature, component, priority: "High",
    preconditions: "System is accessible. Network or server errors can be simulated.",
    steps: [
      step(1, "Simulate a server/network timeout or error during the action", "System displays a user-friendly error message"),
      step(2, "Attempt the action with insufficient permissions or expired session", "System redirects to login or shows permission error"),
      step(3, "Attempt a duplicate action (e.g., submit twice rapidly)", "System handles idempotency correctly — no duplicate records created"),
      step(4, "Verify error messages are clear, actionable, and non-technical", "Error messages guide the user on how to fix the problem"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "ErrorHandling",
    tags: ["error-handling", "negative"],
  })

  return cases
}

// ─── Core Generator for Arabic ────────────────────────────────────────────────

function generateArabic(
  req: ParsedRequirementItem,
  mode: GenerationMode
): Omit<GeneratedTestCaseFromReq, "language">[] {
  const title = req.title.trim()
  const description = req.description || title
  const priority = normalizePriority(req.priority)
  const module = req.module || "عام"
  const feature = req.feature
  const component = req.component
  const reqKey = req.requirementKey
  const acList = (req.acceptanceCriteria || []).filter(Boolean)

  const cases: Omit<GeneratedTestCaseFromReq, "language">[] = []

  // ── إيجابي ────────────────────────────────────────────────────────────────
  const positiveSteps: GeneratedStepFromReq[] = [
    step(1, `الانتقال إلى الصفحة التي تتوفر فيها "${title}"`, "تحميل الصفحة بنجاح مع ظهور جميع العناصر المطلوبة"),
    step(2, `إدخال بيانات صحيحة ومطلوبة لـ: ${description.substring(0, 120)}`, "قبول جميع حقول الإدخال للبيانات دون أخطاء التحقق"),
    step(3, "تنفيذ الإجراء الرئيسي (إرسال / تأكيد / المتابعة)", "اكتمال الإجراء بنجاح"),
    step(4, "التحقق من نتيجة النجاح واستجابة النظام", acList.length > 0 ? acList[0] : `يستجيب النظام كما هو متوقع لـ: ${title}`),
  ]
  if (acList.length > 1) {
    acList.slice(1, 3).forEach((ac, i) => {
      positiveSteps.push(step(5 + i, "التحقق من معيار قبول إضافي", ac))
    })
  }

  cases.push({
    title: `التحقق من ${title} بمدخلات صحيحة`,
    description: `التأكد من أن النظام يعالج "${description.substring(0, 200)}" بشكل صحيح في الظروف العادية.`,
    module, feature, component, priority,
    preconditions: "المستخدم مسجّل الدخول. النظام في حالة مستقرة. البيانات المطلوبة متاحة.",
    steps: positiveSteps,
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Positive",
    tags: ["إيجابي", "smoke"],
  })

  if (mode === "conservative") return cases

  // ── سلبي ──────────────────────────────────────────────────────────────────
  cases.push({
    title: `التحقق من فشل ${title} بمدخلات غير صحيحة`,
    description: `التأكد من أن النظام يعرض رسائل خطأ مناسبة عند إدخال بيانات غير صحيحة لـ: ${title}`,
    module, feature, component, priority,
    preconditions: "المستخدم مسجّل الدخول. النظام في حالة مستقرة.",
    steps: [
      step(1, `الانتقال إلى الصفحة التي تتوفر فيها "${title}"`, "تحميل الصفحة بنجاح"),
      step(2, "ترك الحقول الإلزامية فارغة ومحاولة الإرسال", "ظهور رسائل خطأ للتحقق من الحقول الإلزامية"),
      step(3, "إدخال بيانات بتنسيق غير صحيح (رموز خاصة، قيم خارج النطاق)", "ظهور رسائل التحقق على مستوى الحقل"),
      step(4, "التأكد من أن الإجراء محجوب والنظام لا يزال مستقراً", "عدم حدوث أي تغييرات غير مقصودة. يبقى المستخدم في نفس الصفحة."),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Negative",
    tags: ["سلبي", "تحقق"],
  })

  // ── تحقق ──────────────────────────────────────────────────────────────────
  cases.push({
    title: `التحقق من قواعد التحقق للحقول في ${title}`,
    description: `التحقق من جميع قيود الحقول الإلزامية وقواعد العمل لـ: ${title}`,
    module, feature, component, priority: "Medium",
    preconditions: "المستخدم موجود في النموذج أو الصفحة ذات الصلة.",
    steps: [
      step(1, "تحديد جميع الحقول الإلزامية في النموذج/الصفحة", "وضوح جميع الحقول الإلزامية"),
      step(2, "إرسال النموذج دون ملء أي حقل إلزامي", "يعرض النظام خطأ تحقق لكل حقل إلزامي"),
      step(3, "إدخال بيانات تتجاوز الحد الأقصى للطول", "يقطع النظام المدخلات أو يرفضها"),
      step(4, "إدخال بيانات بتنسيق خاطئ (نص في حقل رقمي، بريد إلكتروني غير صحيح)", "يعرض النظام رسالة تحقق واضحة للتنسيق"),
      step(5, "إدخال قيم الحدود (الحد الأدنى والأقصى للقيم الصالحة)", "يقبل النظام قيم الحدود الدنيا والقصوى"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Validation",
    tags: ["تحقق", "حدود"],
  })

  if (mode === "balanced") return cases

  // ── حالات الحافة ──────────────────────────────────────────────────────────
  cases.push({
    title: `التحقق من حالات الحدود لـ ${title}`,
    description: `اختبار القيم الحدية وحالات الحافة المتعلقة بـ: ${title}`,
    module, feature, component, priority: "Medium",
    preconditions: "المستخدم مسجّل الدخول. النظام متاح.",
    steps: [
      step(1, "اختبار القيمة المسموح بها كحد أدنى", "يقبل النظام الحد الأدنى ويعالجه بشكل صحيح"),
      step(2, "اختبار القيمة المسموح بها كحد أقصى", "يقبل النظام الحد الأقصى ويعالجه بشكل صحيح"),
      step(3, "اختبار قيمة أقل من الحد الأدنى (خارج النطاق)", "يرفض النظام القيمة ويعرض خطأ مناسباً"),
      step(4, "اختبار قيمة أعلى من الحد الأقصى (خارج النطاق)", "يرفض النظام القيمة ويعرض خطأ مناسباً"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "Boundary",
    tags: ["حدود", "حالات-حافة"],
  })

  cases.push({
    title: `التحقق من معالجة الأخطاء لـ ${title}`,
    description: `التأكد من أن النظام يتعامل مع الأخطاء بشكل صحيح لـ: ${title}`,
    module, feature, component, priority: "High",
    preconditions: "النظام متاح. يمكن محاكاة أخطاء الشبكة أو الخادم.",
    steps: [
      step(1, "محاكاة مهلة الشبكة أو خطأ الخادم أثناء الإجراء", "يعرض النظام رسالة خطأ واضحة وسهلة الفهم"),
      step(2, "محاولة الإجراء بصلاحيات غير كافية أو جلسة منتهية", "يحول النظام المستخدم لتسجيل الدخول أو يعرض خطأ الصلاحيات"),
      step(3, "محاولة إجراء مكرر (إرسال مرتين بسرعة)", "يعالج النظام التكرار بشكل صحيح دون إنشاء سجلات مكررة"),
      step(4, "التحقق من أن رسائل الخطأ واضحة وقابلة للتنفيذ", "توجه رسائل الخطأ المستخدم إلى كيفية إصلاح المشكلة"),
    ],
    source: "RequirementFile",
    requirementKey: reqKey,
    testType: "ErrorHandling",
    tags: ["معالجة-أخطاء", "سلبي"],
  })

  return cases
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function generateTestCasesFromParsedItems(
  items: ParsedRequirementItem[],
  options: {
    mode: GenerationMode
    outputLanguage: OutputLanguage
  }
): GeneratedTestCaseFromReq[] {
  const { mode, outputLanguage } = options
  const results: GeneratedTestCaseFromReq[] = []

  for (const item of items) {
    if (!item.title || item.title.trim().length < 3) continue
    const lang = resolveLanguage(item, outputLanguage)

    const rawCases = lang === "ar"
      ? generateArabic(item, mode)
      : generateEnglish(item, mode)

    for (const tc of rawCases) {
      results.push({ ...tc, language: lang })
    }
  }

  return results
}

/** Detect duplicate test cases by title similarity (simple) */
export function detectDuplicates(
  generated: GeneratedTestCaseFromReq[],
  existingTitles: string[]
): Array<{ index: number; title: string; isDuplicate: boolean; matchedTitle?: string }> {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, "").trim()
  const existingNorm = existingTitles.map(normalize)

  return generated.map((tc, index) => {
    const norm = normalize(tc.title)
    const matchedIndex = existingNorm.findIndex(e => e === norm || e.includes(norm.substring(0, 20)) || norm.includes(e.substring(0, 20)))
    return {
      index,
      title: tc.title,
      isDuplicate: matchedIndex !== -1,
      matchedTitle: matchedIndex !== -1 ? existingTitles[matchedIndex] : undefined,
    }
  })
}
