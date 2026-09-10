import type { DimensionScore } from '@/types/report'

/* ==========================================================================
   分数可视化 —— 手写 SVG，不引图表库
   风格要求：石板色为主、陶土色稀疏强调、数字一律 Mono + 等宽数字
   ========================================================================== */

/** 总分环：一圈浅轨 + 一段进度弧 */
export function ScoreRing({
  total,
  max,
  band,
  size = 148,
}: {
  total: number
  max: number
  band: string
  size?: number
}) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const ratio = max > 0 ? Math.max(0, Math.min(1, total / max)) : 0
  const dash = ratio * circumference

  return (
    <div className="score-ring" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" role="img" aria-label={`得分 ${total} 分，满分 ${max} 分`}>
        <circle cx="60" cy="60" r={radius} className="score-ring__track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="score-ring__fill"
          strokeDasharray={`${dash} ${circumference}`}
        />
      </svg>
      <div className="score-ring__label">
        <span className="numeric score-ring__number">{formatScore(total)}</span>
        <span className="numeric score-ring__max">/ {max}</span>
        {band ? <span className="score-ring__band">{band}</span> : null}
      </div>
    </div>
  )
}

/** 维度分数条 */
export function DimensionBars({
  dimensions,
  specs,
}: {
  dimensions: DimensionScore[]
  specs: { key: string; name: string; max: number }[]
}) {
  return (
    <div className="dimbars">
      {specs.map((spec) => {
        const found = dimensions.find((d) => d.key === spec.key)
        const score = found?.score ?? 0
        const ratio = spec.max > 0 ? Math.max(0, Math.min(1, score / spec.max)) : 0
        const weak = ratio < 0.6

        return (
          <div key={spec.key} className="dimbars__row">
            <span className="dimbars__name">{spec.name}</span>
            <span className="dimbars__track">
              <span
                className={`dimbars__fill${weak ? ' dimbars__fill--weak' : ''}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </span>
            <span className="numeric dimbars__value">
              {formatScore(score)}/{spec.max}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** 去掉多余的小数位：5 / 5.5 / 2.5 这样最干净 */
export function formatScore(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
