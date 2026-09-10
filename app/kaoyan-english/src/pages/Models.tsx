import { useState } from 'react'
import { Shell } from '@/components/Shell'
import { IconAlert, IconCheck, IconCopy, IconModel, IconPlus, IconTrash } from '@/components/Icon'
import { modelStatus, useConfigStore } from '@/app/store'
import { toast } from '@/app/ui'
import { getProviderPreset, PROVIDER_PRESETS } from '@/lib/tasks'
import { testConnection, type TestResult } from '@/lib/api'
import type { ModelConfig, ProviderId } from '@/types/domain'

/* ==========================================================================
   模型配置 — 多服务商、多配置、可测试连接
   Key 保存在本机浏览器（localStorage）。页面会明确告知这一点。
   ========================================================================== */

type TestState = { status: 'idle' | 'testing' | 'done'; result?: TestResult }

export function ModelsPage() {
  const models = useConfigStore((s) => s.models)
  const settings = useConfigStore((s) => s.settings)
  const addModel = useConfigStore((s) => s.addModel)
  const updateModel = useConfigStore((s) => s.updateModel)
  const removeModel = useConfigStore((s) => s.removeModel)
  const duplicateModel = useConfigStore((s) => s.duplicateModel)
  const setDefaultModel = useConfigStore((s) => s.setDefaultModel)

  const [addProvider, setAddProvider] = useState<ProviderId>('deepseek')
  const [tests, setTests] = useState<Record<string, TestState>>({})

  const readyCount = models.filter((m) => modelStatus(m).ok).length

  async function handleTest(model: ModelConfig) {
    setTests((prev) => ({ ...prev, [model.id]: { status: 'testing' } }))
    const result = await testConnection(model, settings)
    setTests((prev) => ({ ...prev, [model.id]: { status: 'done', result } }))
    if (result.ok) {
      toast.ok(`${model.label}：${result.message}`)
    } else {
      toast.error(`${model.label}：${result.message}`)
    }
  }

  return (
    <Shell
      route="models"
      title="模型配置"
      crumbs={<span>配置 / 模型服务</span>}
      actions={
        <>
          <span className={`chip ${readyCount > 0 ? 'chip--ok' : 'chip--warn'}`}>
            {readyCount}/{models.length} 可用
          </span>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              const id = addModel(addProvider)
              toast.ok(`已添加 ${getProviderPreset(addProvider)?.name ?? addProvider} 配置`)
              requestAnimationFrame(() => {
                document.getElementById(`model-${id}`)?.scrollIntoView({ block: 'center' })
              })
            }}
          >
            <IconPlus size={13} />
            添加配置
          </button>
        </>
      }
    >
      <div className="page-head">
        <p className="page-head__eyebrow">
          <IconModel size={12} />
          Model Providers
        </p>
        <h2 className="page-head__title">模型服务</h2>
        <p className="page-head__desc">
          平台通过 OpenAI 兼容的 <code>/chat/completions</code> 接口调用模型。DeepSeek、Kimi、通义、
          智谱、OpenAI 均已预置地址与常用模型名，你也可以填任意中转或本地 Ollama 端点。
          被标为「默认」的配置会用于批改。
        </p>
      </div>

      {/* ————— 新增配置 ————— */}
      <section className="panel" style={{ marginBottom: 'var(--ds-6)' }}>
        <div className="panel__head">
          <div>
            <h3 className="panel__title">新增一个配置</h3>
            <p className="panel__desc">选择服务商，会自动带出接口地址与模型名，之后再改都行。</p>
          </div>
        </div>
        <div className="panel__body">
          <div className="provider-grid">
            {PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="card-interactive provider-card"
                aria-pressed={addProvider === preset.id}
                onClick={() => setAddProvider(preset.id)}
              >
                <span className="provider-card__head">
                  <span className="provider-card__name">{preset.name}</span>
                  {preset.supportsVision ? <span className="chip chip--ok">支持识图</span> : null}
                </span>
                <span className="provider-card__note">{preset.note}</span>
                {preset.baseUrl ? (
                  <span className="numeric provider-card__url">{preset.baseUrl}</span>
                ) : (
                  <span className="provider-card__url provider-card__url--empty">自行填写端点</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ————— 已添加的配置 ————— */}
      {models.length === 0 ? (
        <div className="panel">
          <div className="empty">
            <span className="empty__mark">
              <IconModel size={18} />
            </span>
            <h3 className="empty__title">还没有任何模型配置</h3>
            <p className="empty__desc">
              选中上面的服务商后点击右上角「添加配置」，填入 API Key 即可。没有 Key 时依然可以先
              把评分细则写好，配置随时补。
            </p>
          </div>
        </div>
      ) : (
        <div className="stack stack--4">
          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              isDefault={settings.defaultModelId === model.id || (!settings.defaultModelId && models[0]?.id === model.id)}
              test={tests[model.id] ?? { status: 'idle' }}
              onTest={() => handleTest(model)}
              onChange={(patch) => updateModel(model.id, patch)}
              onRemove={() => {
                const ok = window.confirm(`删除配置「${model.label}」？该操作不可撤销。`)
                if (!ok) return
                removeModel(model.id)
                toast.info('已删除配置')
              }}
              onDuplicate={() => {
                duplicateModel(model.id)
                toast.ok('已复制配置，记得替换 API Key')
              }}
              onSetDefault={() => {
                setDefaultModel(model.id)
                toast.ok(`「${model.label}」已设为默认`)
              }}
            />
          ))}
        </div>
      )}
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

function ModelCard({
  model,
  isDefault,
  test,
  onTest,
  onChange,
  onRemove,
  onDuplicate,
  onSetDefault,
}: {
  model: ModelConfig
  isDefault: boolean
  test: TestState
  onTest: () => void
  onChange: (patch: Partial<ModelConfig>) => void
  onRemove: () => void
  onDuplicate: () => void
  onSetDefault: () => void
}) {
  const [revealKey, setRevealKey] = useState(false)
  const preset = getProviderPreset(model.provider)
  const status = modelStatus(model)

  return (
    <section className="panel model-card" id={`model-${model.id}`}>
      <div className="panel__head model-card__head">
        <div className="model-card__ident">
          <span className="model-card__name">{model.label}</span>
          <span className="row row--wrap" style={{ gap: 'var(--ds-2)' }}>
            <span className="chip">{preset?.name ?? model.provider}</span>
            {model.model ? <span className="numeric chip chip--ghost">{model.model}</span> : null}
            {isDefault ? <span className="chip chip--ink">默认</span> : null}
            <span className={`chip chip--${status.level === 'ok' ? 'ok' : status.level === 'warn' ? 'warn' : 'danger'}`}>
              {status.message}
            </span>
          </span>
        </div>

        <div className="row" style={{ gap: 'var(--ds-2)' }}>
          {!isDefault ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onSetDefault}>
              设为默认
            </button>
          ) : null}
          <button type="button" className="btn btn--secondary btn--sm" onClick={onTest} disabled={test.status === 'testing'}>
            {test.status === 'testing' ? <span className="spinner" /> : <IconCheck size={13} />}
            {test.status === 'testing' ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onDuplicate} aria-label="复制配置">
            <IconCopy size={13} />
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove} aria-label="删除配置">
            <IconTrash size={13} />
          </button>
        </div>
      </div>

      <div className="panel__body model-card__body">
        <div className="model-grid">
          <label className="field">
            <span className="field__label">显示名称</span>
            <input
              className="input"
              value={model.label}
              onChange={(e) => onChange({ label: e.target.value })}
              placeholder="例如：DeepSeek 主力"
            />
          </label>

          <label className="field">
            <span className="field__label">服务商</span>
            <select
              className="select"
              value={model.provider}
              onChange={(e) => {
                const provider = e.target.value as ProviderId
                const next = getProviderPreset(provider)
                onChange({
                  provider,
                  baseUrl: next?.baseUrl || model.baseUrl,
                  model: next?.models[0] || model.model,
                  vision: next?.supportsVision ?? model.vision,
                })
              }}
            >
              {PROVIDER_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field model-grid__wide">
            <span className="field__label">
              Base URL
              {preset?.docsUrl ? (
                <a className="link-quiet" href={preset.docsUrl} target="_blank" rel="noreferrer noopener">
                  获取 Key ↗
                </a>
              ) : null}
            </span>
            <input
              className="input numeric"
              value={model.baseUrl}
              onChange={(e) => onChange({ baseUrl: e.target.value })}
              placeholder="https://api.example.com/v1"
              spellCheck={false}
            />
            <span className="field__desc">
              填到 <code>/v1</code> 为止，平台会自动拼上 <code>/chat/completions</code>。
            </span>
          </label>

          <label className="field model-grid__wide">
            <span className="field__label">API Key</span>
            <span className="input-group">
              <input
                className="input numeric"
                type={revealKey ? 'text' : 'password'}
                value={model.apiKey}
                onChange={(e) => onChange({ apiKey: e.target.value.trim() })}
                placeholder="sk-..."
                spellCheck={false}
                autoComplete="off"
              />
              <button type="button" className="btn btn--secondary" onClick={() => setRevealKey((v) => !v)}>
                {revealKey ? '隐藏' : '显示'}
              </button>
            </span>
            <span className="field__desc">
              仅保存在本机浏览器，不会上传到任何第三方服务器（调用时直接发给所选服务商）。
            </span>
          </label>

          <label className="field">
            <span className="field__label">模型名称</span>
            <input
              className="input numeric"
              value={model.model}
              onChange={(e) => onChange({ model: e.target.value.trim() })}
              placeholder="deepseek-chat"
              list={`models-${model.id}`}
              spellCheck={false}
            />
            <datalist id={`models-${model.id}`}>
              {(preset?.models ?? []).map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </label>

          <label className="field">
            <span className="field__label">
              温度 <span className="field__hint">批改建议 0.2–0.4</span>
            </span>
            <span className="row" style={{ gap: 'var(--ds-3)' }}>
              <input
                type="range"
                className="range"
                min={0}
                max={1}
                step={0.05}
                value={model.temperature}
                onChange={(e) => onChange({ temperature: Number(e.target.value) })}
              />
              <span className="numeric" style={{ width: 32, textAlign: 'right' }}>
                {model.temperature.toFixed(2)}
              </span>
            </span>
          </label>

          <label className="field">
            <span className="field__label">
              单次输出上限 <span className="field__hint">tokens</span>
            </span>
            <input
              className="input numeric"
              type="number"
              min={512}
              max={32768}
              step={256}
              value={model.maxTokens}
              onChange={(e) => onChange({ maxTokens: Number(e.target.value) || 4096 })}
            />
          </label>
        </div>

        <div className="switch-row model-card__switch">
          <div className="switch-row__text">
            <p className="field__label">支持图片输入（视觉模型）</p>
            <p className="field__desc">
              开启后，批改台可以上传作文照片，由该模型先做文字识别再批改。
              {preset ? (preset.supportsVision ? '　该服务商有此能力。' : '　该服务商预置模型不支持，请确认你填的模型名是否为视觉版本。') : ''}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={model.vision}
            aria-label="支持图片输入"
            className="switch"
            onClick={() => onChange({ vision: !model.vision })}
          />
        </div>

        {test.status === 'done' && test.result ? (
          <div className={`note note--${test.result.ok ? 'ok' : 'danger'}`} style={{ marginTop: 'var(--ds-4)' }}>
            <span className="note__icon">{test.result.ok ? <IconCheck size={13} /> : <IconAlert size={13} />}</span>
            <div className="note__body">
              <p className="note__title">{test.result.message}</p>
              {test.result.ok ? (
                <>
                  <p className="numeric" style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-ink-muted)' }}>
                    模型回复「{test.result.reply}」 · 耗时 {test.result.elapsedMs} ms
                  </p>
                  {test.result.warnings?.length ? (
                    <ul className="model-warn">
                      {test.result.warnings.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : (
                <p style={{ fontSize: 'var(--ds-text-xs)', color: 'var(--ds-ink-muted)' }}>
                  {test.result.detail ? test.result.detail.slice(0, 300) : '请检查 Base URL、API Key 与模型名称。'}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
