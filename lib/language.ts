/**
 * Output language switch.
 *
 * Keep internal enum tokens in English for schema validation:
 * Buy / Overweight / Hold / Underweight / Sell.
 * User-visible analysis text should be Chinese by default.
 */

export const OUTPUT_LANGUAGE = process.env.OUTPUT_LANGUAGE || 'Chinese';

export function languageInstruction(): string {
  if (OUTPUT_LANGUAGE === 'English') return '';

  if (OUTPUT_LANGUAGE === 'Chinese' || OUTPUT_LANGUAGE === '中文') {
    return `

---

重要：面向用户的报告、章节标题、表格、结论、理由、摘要和投资论点必须用中文输出。
但是结构化 JSON 的枚举字段必须保留英文枚举 token：
- rating/recommendation: Buy / Overweight / Hold / Underweight / Sell
- action: Buy / Hold / Sell
可在可读文本里附带中文解释，例如“减持（Underweight）”。`;
  }

  return `

---

IMPORTANT: Write user-visible text in ${OUTPUT_LANGUAGE}. Keep JSON enum tokens exactly as required by the schema.`;
}
