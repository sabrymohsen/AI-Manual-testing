/**
 * The prompt context for generating test cases from one BRD requirement.
 */
import type { Impact } from "@/lib/brd/impact"

export type GenReq = {
  id: string
  key: string
  title: string
  description: string
  taskId: string | null
  acceptanceCriteria: unknown
  section: string | null
  parentKey: string | null
  priority: string | null
  status: string
}

export const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : [])

/**
 * What the AI needs to test like a professional tester: the acceptance
 * criteria, the Critical/High impacted requirements it must write regression
 * cases for, and the open questions it must not answer by guessing.
 */
export function buildGenerationContext(
  req: GenReq,
  impacted: Impact[],
  openQuestions: { key: string; question: string }[],
  arabic: boolean,
  /** The BRD's test users: role names and step keys only — never logins. */
  users: { key: string; role: string }[] = []
): string {
  const parts = [`${req.key}: ${req.title}`, "", req.description]
  const ac = asList(req.acceptanceCriteria)
  if (ac.length) parts.push("", arabic ? "معايير القبول:" : "Acceptance criteria:", ...ac.map((a, i) => `AC-${i + 1}. ${a}`))
  if (impacted.length) {
    parts.push(
      "",
      arabic
        ? "متطلبات متأثرة (اكتب حالة اختبار انحدار واحدة على الأقل لكل منها، وأضف لها الوسم \"regression\" ومفتاح المتطلب):"
        : "Impacted requirements (write at least one REGRESSION test for each, proving it still works; tag it \"regression\" and the requirement key):",
      ...impacted.map((i) => `- ${i.key} (${i.level}): ${i.title} — ${i.testFocus}`)
    )
  }
  if (openQuestions.length) {
    parts.push(
      "",
      arabic
        ? "أسئلة مفتوحة (لا تفترض الإجابة؛ إذا اعتمدت حالة على أحدها فأضف مفتاح السؤال كوسم مثل Q-01):"
        : "Open questions (do NOT assume an answer; if a test depends on one, add its key as a tag, e.g. Q-01):",
      ...openQuestions.map((q) => `- ${q.key}: ${q.question}`)
    )
  }
  if (users.length) parts.push("", ...usersInstructions(users, arabic))
  return parts.join("\n")
}

/**
 * How generated cases name their users, so the Browser Agent can run them:
 * every step starts with "As <key>:", each user logs in first with
 * {<key>_username} / {<key>_password}, and a value one user hands to another
 * is remembered as {name}.
 */
export function usersInstructions(users: { key: string; role: string }[], arabic: boolean): string[] {
  const list = users.map((u) => `- ${u.key} = ${u.role}`)
  const first = users[0].key
  const second = users[1]?.key
  return arabic
    ? [
        "مستخدمو النظام في هذا المستند (المفتاح = الدور):",
        ...list,
        "قواعد المستخدمين (إلزامية):",
        `- ابدأ كل خطوة بـ "As <المفتاح>:" بالإنجليزية ثم الخطوة، مثل: "As ${first}: اضغط زر إرسال".`,
        `- أول خطوة لكل مستخدم تظهر في الحالة هي تسجيل دخوله: "As ${first}: سجل الدخول باسم المستخدم {${first}_username} وكلمة المرور {${first}_password}".`,
        "- لا تكتب أسماء مستخدمين أو كلمات مرور حقيقية أبداً؛ استخدم المتغيرات كما هي.",
        "- في الشروط المسبقة (preconditions) اذكر المستخدمين المطلوبين بمفاتيحهم وأي بيانات يجب أن تكون موجودة قبل البدء.",
        second
          ? `- إذا احتاج مستخدم قيمة أنشأها مستخدم آخر (مثل رقم الطلب) فأضف خطوة "As ${first}: احفظ رقم الطلب باسم {request_id}" ثم استخدم {request_id} في خطوات ${second}.`
          : "- إذا احتجت قيمة تظهر في الصفحة لاحقاً (مثل رقم الطلب) فأضف خطوة لحفظها باسم مثل {request_id}.",
        "- استخدم فقط المستخدمين المذكورين في القائمة، وفقط من يحتاجه الاختبار.",
        "- بيانات الاختبار الأخرى (عنوان، مبلغ) تُكتب كقيمة حقيقية بين علامتي تنصيص، وليس كمتغير {جديد}.",
      ]
    : [
        "Users of the system in this BRD (key = role):",
        ...list,
        "User rules (required):",
        `- Start EVERY step with "As <key>:" then the step, e.g. "As ${first}: Click Submit".`,
        `- The first step of each user in a case logs them in: "As ${first}: Log in with {${first}_username} and {${first}_password}".`,
        "- Never write real usernames or passwords; use the placeholders exactly.",
        "- In preconditions, name the users the case needs by key and any data that must exist before it starts.",
        second
          ? `- When a user needs a value another user created (a request number), add a step "As ${first}: Remember the request number as {request_id}" and use {request_id} in ${second}'s steps.`
          : "- When a later step needs a value the page shows (a request number), add a step to remember it as {request_id}.",
        "- Use only users from this list, and only the ones the test needs.",
        '- Other test data (a title, an amount) is written as a real value in quotes, e.g. Type "Broken screen" in the Title field — not as a new {placeholder}.',
      ]
}

