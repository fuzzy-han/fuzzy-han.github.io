#!/usr/bin/env node
/* ==========================================================================
   构建产物与运行时自检
   · 层叠顺序：页面 CSS 必须晚于 components.css，否则同特异性覆盖会静默失效
   · 运行时几何：细则编辑器高度必须真的生效（曾因层叠失效退化成 88px）
   · 关键类名：CSS 里定义的选择器必须与 JSX 里用到的类名对得上
   ========================================================================== */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname

let failed = 0
const results = []

function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  if (!pass) failed += 1
}

/* ---------- 1. 构建产物层叠顺序 ---------- */

const distDir = join(root, 'dist/assets')
if (!existsSync(distDir)) {
  console.error('✗ 未找到 dist/assets，请先运行 pnpm build')
  process.exit(1)
}

const cssFile = readdirSync(distDir).find((f) => f.endsWith('.css'))
if (!cssFile) {
  console.error('✗ dist/assets 中没有 CSS 产物')
  process.exit(1)
}

const css = readFileSync(join(distDir, cssFile), 'utf8')
const at = (selector) => {
  const needle = typeof selector === 'string' ? selector : selector.source
  const index = css.indexOf(needle)
  return index
}

const tokensIdx = at(':root{')
const btnIdx = at('.btn{')
const panelIdx = at('.panel{')
const wbHeroIdx = at('.wb-hero{')
const rubricTabsIdx = at('.rubric-tabs{')
const providerIdx = at('.provider-grid{')

check('CSS 含 tokens 层', tokensIdx >= 0)
check('CSS 含 components 层', btnIdx >= 0 && panelIdx >= 0)
check('CSS 含 pages 层', wbHeroIdx >= 0 && rubricTabsIdx >= 0 && providerIdx >= 0)
check(
  'tokens → components 顺序正确',
  tokensIdx >= 0 && btnIdx > tokensIdx,
  `tokens@${tokensIdx} components@${btnIdx}`,
)
check(
  'components → pages 顺序正确（页面覆盖组件）',
  panelIdx >= 0 && wbHeroIdx > panelIdx && rubricTabsIdx > panelIdx && providerIdx > panelIdx,
  `panel@${panelIdx} wb-hero@${wbHeroIdx} rubric-tabs@${rubricTabsIdx} provider-grid@${providerIdx}`,
)

// 曾经的 bug：.textarea 的 min-height:88px 吃掉了 .rubric-textarea 的 560px
const textareaIdx = css.indexOf('.textarea{')
const rubricTextareaIdx = css.indexOf('.rubric-textarea{')
check(
  '.rubric-textarea 晚于 .textarea（防高度被覆盖）',
  rubricTextareaIdx >= 0 && textareaIdx >= 0 && rubricTextareaIdx > textareaIdx,
  `.textarea@${textareaIdx} .rubric-textarea@${rubricTextareaIdx}`,
)

/* ---------- 2. 类名对账：JSX 用到的类名是否在 CSS 里存在 ---------- */

const jsxClasses = new Set()
const scanFiles = execFileSync(
  'find',
  [join(root, 'src'), '-name', '*.tsx', '-o', '-name', '*.ts'],
  { encoding: 'utf8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

for (const file of scanFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/className=\{?[`"]([^`"}]+)[`"]\}?/g)) {
    for (const token of match[1].split(/\s+/)) {
      if (/^[a-z][a-z0-9-]*(__[a-z0-9-]+)?(--[a-z0-9-]+)?$/.test(token)) {
        jsxClasses.add(token)
      }
    }
  }
}

// 模板字符串拼出来的类名（如 readiness__item--${tone}）单独收集
const dynamicPrefixes = new Set()
for (const file of scanFiles) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(/className=\{?`([^`]*\$\{[^`]*)`\}?/g)) {
    const base = match[1].split('${')[0].trim()
    if (base) dynamicPrefixes.add(base.replace(/\s+$/, ''))
  }
}

const styleCss = ['styles/tokens.css', 'styles/components.css', ...readdirSync(join(root, 'src/pages')).filter((f) => f.endsWith('.css')).map((f) => `pages/${f}`)]
  .map((rel) => readFileSync(join(root, 'src', rel), 'utf8'))
  .join('\n')

const missing = []
for (const cls of jsxClasses) {
  // 只检查带 BEM 前缀的类名，纯工具类/单段类名可能是外部约定
  if (!/__|--/.test(cls)) continue
  if (!styleCss.includes(`.${cls}`)) missing.push(cls)
}

check(
  'JSX 中的 BEM 类名都在 CSS 里有定义',
  missing.length === 0,
  missing.length ? `缺失：${missing.join(', ')}` : '',
)

for (const prefix of dynamicPrefixes) {
  const base = prefix.split(/\s+/)[0]
  if (!/__/.test(base)) continue
  check(
    `动态类名前缀 .${base} 有定义`,
    styleCss.includes(`.${base}`),
    '',
  )
}

/* ---------- 输出 ---------- */

console.log('\n构建产物自检\n' + '─'.repeat(56))
for (const r of results) {
  console.log(`${r.pass ? '  PASS' : '  FAIL'}  ${r.name}${r.detail ? `\n        ${r.detail}` : ''}`)
}
console.log('─'.repeat(56))
console.log(`${results.length - failed}/${results.length} 通过\n`)

process.exit(failed ? 1 : 0)
