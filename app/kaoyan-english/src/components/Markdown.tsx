import { Fragment, type ReactNode } from 'react'

/* ==========================================================================
   轻量 Markdown 渲染 — 仅覆盖细则编辑会用到的一小撮语法
   刻意不引 markdown-it / remark：省一个依赖，也避免 XSS 面（全程不注入 HTML）
   支持：# 标题、- / 1. 列表、> 引用、--- 分隔、| 表格、**粗体**、`代码`
   ========================================================================== */

/** 行内解析：**粗体**、`代码` */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let i = 0

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    const key = `${keyPrefix}-i${i++}`
    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else {
      nodes.push(<code key={key}>{token.slice(1, -1)}</code>)
    }
    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes.length > 0 ? nodes : [text]
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []

  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    /* 空行 */
    if (trimmed === '') {
      i += 1
      continue
    }

    /* 分隔线 */
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${key++}`} />)
      i += 1
      continue
    }

    /* 标题 */
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed)
    if (heading) {
      const level = Math.min(heading[1].length, 3)
      const Tag = (level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3') as 'h1' | 'h2' | 'h3'
      blocks.push(<Tag key={`h-${key++}`}>{renderInline(heading[2], `h${key}`)}</Tag>)
      i += 1
      continue
    }

    /* 表格 */
    if (trimmed.startsWith('|') && i + 1 < lines.length && /^\|[\s:|-]+\|$/.test(lines[i + 1].trim())) {
      const header = splitTableRow(trimmed)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(splitTableRow(lines[i]))
        i += 1
      }
      blocks.push(
        <table key={`t-${key++}`}>
          <thead>
            <tr>
              {header.map((cell, ci) => (
                <th key={ci}>{renderInline(cell, `th${ci}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci}>{renderInline(cell, `td${ri}-${ci}`)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
      continue
    }

    /* 引用 */
    if (trimmed.startsWith('>')) {
      const quote: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote key={`q-${key++}`} style={{ margin: 'var(--ds-3) 0', paddingLeft: 'var(--ds-4)', borderLeft: '2px solid var(--ds-border-strong)', color: 'var(--ds-ink-muted)' }}>
          {quote.map((q, qi) => (
            <p key={qi}>{renderInline(q, `q${qi}`)}</p>
          ))}
        </blockquote>,
      )
      continue
    }

    /* 无序列表 */
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`ul-${key++}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `ul${ii}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    /* 有序列表 */
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = []
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`ol-${key++}`}>
          {items.map((item, ii) => (
            <li key={ii}>{renderInline(item, `ol${ii}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    /* 段落：连续非空行合并 */
    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/.test(lines[i].trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    blocks.push(
      <p key={`p-${key++}`}>
        {paragraph.map((seg, si) => (
          <Fragment key={si}>
            {si > 0 ? ' ' : null}
            {renderInline(seg, `p${key}-${si}`)}
          </Fragment>
        ))}
      </p>,
    )
  }

  return <div className="md-preview">{blocks}</div>
}
