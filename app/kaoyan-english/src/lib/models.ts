/* ==========================================================================
   模型能力的判断规则（纯函数，无依赖）

   单独成文件的原因：api.ts（连接测试）与 grade.ts（批改额度）都要用这套判断，
   放在任一方的文件里都会形成循环依赖。
   ========================================================================== */

/**
 * 模型名看着像「思考型」。
 *
 * 依据是命名惯例：reasoner / thinking / o1 / o3 / o4 / -r1 / vision-exp 等。
 * 这类模型会先输出一段推理过程（reasoning_content），正文要等推理结束才开始，
 * 因此需要明显更大的输出额度，否则会「正文还没写就被截断」。
 */
const REASONING_MODEL_HINT = /reasoner|thinking|think|-r1|o1-|o3-|o4-|vision-exp/i

export function isReasoningModelName(name: string): boolean {
  return REASONING_MODEL_HINT.test(name.trim())
}

/**
 * 思考型模型的起步输出额度。
 * 实测一次完整批改报告需要 6000–9000 tokens，加上推理过程，16384 才比较稳。
 */
export const REASONING_MIN_TOKENS = 16384

/** 单次输出上限的兜底最大值，避免用户填了离谱的数字把费用打爆 */
export const MAX_TOKENS_CEILING = 32768

/**
 * 按模型类型给出合适的起步额度。
 * 思考型给足，普通模型尊重用户设置。
 */
export function resolveStartTokens(modelName: string, configured: number): number {
  if (!isReasoningModelName(modelName)) return configured
  return Math.max(configured, REASONING_MIN_TOKENS)
}
