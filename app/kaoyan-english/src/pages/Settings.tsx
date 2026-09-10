import { useRef, useState } from 'react'
import { Shell } from '@/components/Shell'
import { IconAlert, IconCheck, IconDownload, IconSettings, IconTrash, IconUpload } from '@/components/Icon'
import { navigate } from '@/app/router'
import { DEFAULT_SETTINGS, useConfigStore } from '@/app/store'
import { toast } from '@/app/ui'
import { TASK_ORDER, TASK_SPECS } from '@/lib/tasks'
import { isRubricFilled } from '@/lib/rubric'
import { STORES, idb, closeDB } from '@/lib/storage'
import type { AppSettings, ModelConfig, Rubric, TaskType } from '@/types/domain'

/* ==========================================================================
   通用设置 — 传输通道、批改参数、数据导入导出
   ========================================================================== */

interface BackupPayload {
  kind: 'kaoyan-writing-coach-backup'
  version: 1
  exportedAt: string
  settings: AppSettings
  models: ModelConfig[]
  rubrics: Record<TaskType, Rubric>
  includesSecrets: boolean
}

export function SettingsPage() {
  const settings = useConfigStore((s) => s.settings)
  const models = useConfigStore((s) => s.models)
  const rubrics = useConfigStore((s) => s.rubrics)
  const updateSettings = useConfigStore((s) => s.updateSettings)
  const resetSettings = useConfigStore((s) => s.resetSettings)

  const [includeSecrets, setIncludeSecrets] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  /*
   * 站点跑在 https 上、而代理是 http://127.0.0.1 时，浏览器会按「混合内容」
   * 直接拦掉请求（表现为 Failed to fetch / 网络请求失败）。
   * 这个组合在本地开发时完全正常，一部署到线上就失效，属于最容易踩的坑之一，
   * 所以直接在这里提示，而不是让用户去猜。
   */
  const isHttpsSite = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const proxyIsLocalHttp =
    settings.proxyBaseUrl.trim().startsWith('http://') &&
    /(127\.0\.0\.1|localhost|0\.0\.0\.0)/.test(settings.proxyBaseUrl)
  const mixedContentRisk = isHttpsSite && proxyIsLocalHttp

  function handleExport() {
    const payload: BackupPayload = {
      kind: 'kaoyan-writing-coach-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      models: includeSecrets ? models : models.map((m) => ({ ...m, apiKey: '' })),
      rubrics,
      includesSecrets: includeSecrets,
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `砚台配置备份-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    toast.ok(includeSecrets ? '已导出（含 API Key，请妥善保管）' : '已导出（不含 API Key）')
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text()
      const payload = JSON.parse(text) as Partial<BackupPayload>

      if (payload.kind !== 'kaoyan-writing-coach-backup') {
        toast.error('这不是本平台的备份文件')
        return
      }

      const ok = window.confirm(
        '导入会覆盖当前的模型配置、评分细则与设置。建议先导出一次现有配置。继续？',
      )
      if (!ok) return

      useConfigStore.setState({
        settings: { ...DEFAULT_SETTINGS, ...(payload.settings ?? {}) },
        models: Array.isArray(payload.models) ? payload.models : [],
        rubrics: { ...rubrics, ...(payload.rubrics ?? {}) },
      })
      toast.ok('导入完成')
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : String(err)}`)
    }
  }

  async function handleClearAll() {
    const ok = window.confirm('清空本机所有数据（模型配置、评分细则、批改记录）？此操作不可撤销。')
    if (!ok) return
    const typed = window.prompt('请输入「清空」以确认：')
    if (typed !== '清空') {
      toast.info('已取消')
      return
    }
    localStorage.clear()
    // 必须先关连接：否则 clear/delete 会一直挂起，用户看到的是「清空后一直转圈」
    closeDB()
    await idb.clear(STORES.reports)
    toast.ok('已清空，正在重新载入…')
    setTimeout(() => window.location.reload(), 600)
  }

  return (
    <Shell
      route="settings"
      title="通用设置"
      crumbs={<span>配置 / 通用</span>}
      actions={
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => {
            resetSettings()
            toast.info('已恢复默认参数')
          }}
        >
          恢复默认参数
        </button>
      }
    >
      <div className="page-head">
        <p className="page-head__eyebrow">
          <IconSettings size={12} />
          Preferences
        </p>
        <h2 className="page-head__title">通用设置</h2>
        <p className="page-head__desc">
          控制请求通道、批改行为与本地数据。这些设置与模型配置、评分细则一样，全部保存在本机浏览器。
        </p>
      </div>

      <div className="settings-layout">
        <div className="stack stack--6">
          {/* ————— 通道 ————— */}
          <section className="panel">
            <div className="panel__head">
              <div>
                <h3 className="panel__title">请求通道</h3>
                <p className="panel__desc">
                  决定浏览器怎么把请求发出去。大多数情况下直连即可；若服务商不允许浏览器跨域访问，
                  改用本地代理。
                </p>
              </div>
            </div>
            <div className="panel__body stack stack--5">
              <div className="channel-grid">
                <button
                  type="button"
                  className="card-interactive channel-card"
                  aria-pressed={settings.transport === 'direct'}
                  onClick={() => updateSettings({ transport: 'direct' })}
                >
                  <span className="channel-card__name">浏览器直连</span>
                  <span className="channel-card__desc">
                    Key 只存在本机，请求直接从浏览器发往服务商。零部署，隐私最佳。
                    主流服务商都允许本站直连，线上使用请选这一项。
                  </span>
                  <span className="channel-card__tag">推荐</span>
                </button>
                <button
                  type="button"
                  className="card-interactive channel-card"
                  aria-pressed={settings.transport === 'proxy'}
                  onClick={() => updateSettings({ transport: 'proxy' })}
                >
                  <span className="channel-card__name">本地代理</span>
                  <span className="channel-card__desc">
                    请求先发到本机 Node 代理再转发，绕过浏览器跨域限制，Key 也可交由服务端保管。
                  </span>
                  <span className="channel-card__tag">需启动后端</span>
                </button>
              </div>

              {settings.transport === 'proxy' ? (
                <div className="stack stack--4 settings-proxy">
                  <label className="field">
                    <span className="field__label">代理地址</span>
                    <input
                      className="input numeric"
                      value={settings.proxyBaseUrl}
                      spellCheck={false}
                      placeholder="http://127.0.0.1:8787"
                      onChange={(e) => updateSettings({ proxyBaseUrl: e.target.value.trim() })}
                    />
                    <span className="field__desc">
                      平台会请求 <code>{settings.proxyBaseUrl || '<代理地址>'}/v1/chat/completions</code>
                      ，并把上游地址与 Key 通过请求头转交。
                    </span>
                  </label>
                  <label className="field">
                    <span className="field__label">
                      代理口令 <span className="field__hint">可留空</span>
                    </span>
                    <input
                      className="input numeric"
                      type="password"
                      value={settings.proxyToken}
                      spellCheck={false}
                      autoComplete="off"
                      placeholder="仅在代理开启鉴权时填写"
                      onChange={(e) => updateSettings({ proxyToken: e.target.value.trim() })}
                    />
                  </label>
                  {mixedContentRisk ? (
                    <div className="note note--danger">
                      <span className="note__icon">
                        <IconAlert size={13} />
                      </span>
                      <div className="note__body">
                        <p className="note__title">当前是 HTTPS 站点，无法访问本机 HTTP 代理</p>
                        <p>
                          当前页面走 HTTPS，而代理地址是 <code>{settings.proxyBaseUrl}</code>，
                          浏览器会按「混合内容」直接拦掉这个请求，表现为「网络请求失败 / Failed to fetch」。
                        </p>
                        <p style={{ marginTop: 'var(--ds-2)' }}>
                          <strong>日常使用请切回「浏览器直连」</strong>——DeepSeek、Kimi、通义、智谱、
                          OpenAI 都允许从本站直接调用。本地代理只在你自己电脑上跑开发环境
                          （http://127.0.0.1:5273）时才可用。
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="note note--ok">
                      <span className="note__icon">
                        <IconCheck size={13} />
                      </span>
                      <div className="note__body">
                        <p className="note__title">请在另一终端启动代理</p>
                        <p>
                          在项目目录执行 <code>pnpm proxy</code>，代理默认监听 8787 端口。
                          前端请求会带上上游地址与密钥，由代理转发；批改内容不会落盘。
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </section>

          {/* ————— 批改参数 ————— */}
          <section className="panel">
            <div className="panel__head">
              <div>
                <h3 className="panel__title">批改参数</h3>
                <p className="panel__desc">影响每次批改请求的组装方式与结果粒度。</p>
              </div>
            </div>
            <div className="panel__body stack stack--6">
              <label className="field">
                <span className="field__label">批改严格度</span>
                <div className="segmented" role="tablist" aria-label="批改严格度" style={{ alignSelf: 'flex-start' }}>
                  {(
                    [
                      { key: 'lenient', label: '宽松', hint: '以鼓励为主，只挑影响理解的错误' },
                      { key: 'standard', label: '标准', hint: '对齐官方阅卷口径' },
                      { key: 'strict', label: '严格', hint: '按高分标准逐句挑刺' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      role="tab"
                      aria-selected={settings.strictness === item.key}
                      className="segmented__item"
                      title={item.hint}
                      onClick={() => updateSettings({ strictness: item.key })}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <span className="field__desc">
                  该选项会作为附加指令注入 prompt，与你的评分细则共同生效。
                </span>
              </label>

              <div className="switch-row">
                <div className="switch-row__text">
                  <p className="field__label">输出逐句诊断</p>
                  <p className="field__desc">
                    开启后每个句子都会给出语法问题、优化句与结构划分（报告页的折叠卡）。
                    关闭则只输出总评与全文改写，可显著降低 token 消耗。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.sentenceLevel}
                  aria-label="输出逐句诊断"
                  className="switch"
                  onClick={() => updateSettings({ sentenceLevel: !settings.sentenceLevel })}
                />
              </div>

              <div className="switch-row">
                <div className="switch-row__text">
                  <p className="field__label">优先保证结构化输出稳定</p>
                  <p className="field__desc">
                    开启后首次请求直接走非流式 + JSON 模式。实测流式请求不带 JSON 模式时，
                    模型有不小概率回一篇文字报告而不是 JSON，会白白多花一轮重试。
                    关闭则优先流式（能看到实时进度），但首轮失败率更高。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.preferReliableJson}
                  aria-label="优先保证结构化输出稳定"
                  className="switch"
                  onClick={() => updateSettings({ preferReliableJson: !settings.preferReliableJson })}
                />
              </div>

              <div className="switch-row">
                <div className="switch-row__text">
                  <p className="field__label">JSON 解析失败时自动重试</p>
                  <p className="field__desc">
                    模型偶尔会返回带多余说明文字或残缺的 JSON。开启后平台会自动修复并重试一次，
                    失败才向你报错。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.autoRetry}
                  aria-label="自动重试"
                  className="switch"
                  onClick={() => updateSettings({ autoRetry: !settings.autoRetry })}
                />
              </div>

              <label className="field" style={{ maxWidth: 240 }}>
                <span className="field__label">
                  请求超时 <span className="field__hint">秒</span>
                </span>
                <input
                  className="input numeric"
                  type="number"
                  min={15}
                  max={600}
                  step={15}
                  value={settings.timeoutSec}
                  onChange={(e) => updateSettings({ timeoutSec: Number(e.target.value) || 120 })}
                />
                <span className="field__desc">逐句诊断输出较长，建议不低于 120 秒。</span>
              </label>
            </div>
          </section>

          {/* ————— 数据 ————— */}
          <section className="panel">
            <div className="panel__head">
              <div>
                <h3 className="panel__title">数据</h3>
                <p className="panel__desc">
                  所有配置与批改记录都存放在本机浏览器。换电脑或换浏览器时，用导出 / 导入迁移。
                </p>
              </div>
            </div>
            <div className="panel__body stack stack--5">
              <div className="switch-row">
                <div className="switch-row__text">
                  <p className="field__label">导出时包含 API Key</p>
                  <p className="field__desc">
                    开启后备份文件里会有明文 Key，方便一次性迁移；若要把文件发人，请保持关闭。
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={includeSecrets}
                  aria-label="导出包含 API Key"
                  className="switch"
                  onClick={() => setIncludeSecrets((v) => !v)}
                />
              </div>

              <div className="row row--wrap" style={{ gap: 'var(--ds-2)' }}>
                <button type="button" className="btn btn--secondary btn--sm" onClick={handleExport}>
                  <IconDownload size={13} />
                  导出配置
                </button>
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => fileRef.current?.click()}
                >
                  <IconUpload size={13} />
                  导入配置
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleImport(file)
                    e.target.value = ''
                  }}
                />
                <button type="button" className="btn btn--danger btn--sm" onClick={handleClearAll}>
                  <IconTrash size={13} />
                  清空全部数据
                </button>
              </div>

              <div className="stats-row">
                <span className="stats-row__item">
                  <span className="numeric stats-row__num">{models.length}</span>
                  <span>模型配置</span>
                </span>
                <span className="stats-row__item">
                  <span className="numeric stats-row__num">
                    {TASK_ORDER.filter((t) => rubrics[t].versions.length > 0).length}
                  </span>
                  <span>有版本历史的细则</span>
                </span>
                <span className="stats-row__item">
                  <span className="numeric stats-row__num">
                    {TASK_ORDER.reduce((sum, t) => sum + rubrics[t].versions.length, 0)}
                  </span>
                  <span>细则历史版本</span>
                </span>
              </div>
            </div>
          </section>
        </div>

        {/* ————— 右侧速览 ————— */}
        <aside className="settings-side stack stack--4">
          <section className="panel">
            <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                当前状态
              </h3>
            </div>
            <div className="panel__body stack stack--3" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <SumRow label="请求通道" value={settings.transport === 'direct' ? '浏览器直连' : '本地代理'} />
              <SumRow label="默认模型" value={models.find((m) => m.id === settings.defaultModelId)?.label ?? (models[0]?.label ?? '未配置')} />
              <SumRow label="批改严格度" value={{ lenient: '宽松', standard: '标准', strict: '严格' }[settings.strictness]} />
              <SumRow label="逐句诊断" value={settings.sentenceLevel ? '开启' : '关闭'} />
              <SumRow label="超时" value={`${settings.timeoutSec} 秒`} numeric />
            </div>
          </section>

          <section className="panel">
            <div className="panel__head" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              <h3 className="panel__title" style={{ fontSize: 'var(--ds-text-base)' }}>
                细则完成度
              </h3>
            </div>
            <div className="panel__body stack stack--2" style={{ padding: 'var(--ds-4) var(--ds-5)' }}>
              {TASK_ORDER.map((type) => {
                const filled = isRubricFilled(rubrics[type])
                return (
                  <button
                    key={type}
                    type="button"
                    className="sumrow sumrow--button"
                    onClick={() => navigate('rubrics')}
                  >
                    <span className="sumrow__label">{TASK_SPECS[type].shortName}</span>
                    <span className={`chip ${filled ? 'chip--ok' : 'chip--warn'}`}>
                      {filled ? <IconCheck size={11} /> : null}
                      {filled ? '已填写' : '待填写'}
                    </span>
                  </button>
                )
              })}
              <p className="field__desc" style={{ marginTop: 'var(--ds-2)' }}>
                细则正文在「评分细则」页编辑，会整段作为 prompt 上传给模型。
              </p>
            </div>
          </section>
        </aside>
      </div>
    </Shell>
  )
}

function SumRow({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="sumrow">
      <span className="sumrow__label">{label}</span>
      <span className={`sumrow__value${numeric ? ' numeric' : ''}`}>{value}</span>
    </div>
  )
}
