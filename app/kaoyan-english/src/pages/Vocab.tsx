import { useEffect, useMemo, useRef, useState } from 'react'
import { Shell } from '@/components/Shell'
import { navigate } from '@/app/router'
import { toast } from '@/app/ui'
import {
  buildLinks,
  buildWordIndex,
  groupByLetter,
  loadMasteredWords,
  loadVocab,
  saveMasteredWords,
  searchVocab,
  type SearchHit,
} from '@/lib/vocab'
import {
  LINK_KIND_META,
  type LinkKind,
  type VocabData,
  type VocabWord,
} from '@/types/vocab'
import {
  IconBook,
  IconCheck,
  IconInfo,
  IconSpark,
} from '@/components/Icon'
import './vocab.css'

/* ==========================================================================
   词汇广场
   · 5288 个考研词（KaoYan 三分册 + 补充），全局检索词形/释义/短语/同近词
   · 每个词把相似词串起来：同义 / 同根 / 形近，三类分开呈现
   · 可标记已掌握，注意力留给没记住的
   ========================================================================== */

type SortMode = 'rank' | 'alpha'

export function VocabPage() {
  const [data, setData] = useState<VocabData | null>(null)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortMode>('rank')
  const [letter, setLetter] = useState<string>('A')
  const [onlyUnmastered, setOnlyUnmastered] = useState(false)
  const [mastered, setMastered] = useState<Record<string, boolean>>(loadMasteredWords)

  const [active, setActive] = useState<VocabWord | null>(null)
  const detailRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    loadVocab((p) => !cancelled && setProgress(p.message))
      .then((d) => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : '词汇库加载失败')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const index = useMemo(() => (data ? buildWordIndex(data.words) : new Map<string, VocabWord>()), [data])

  const hits: SearchHit[] = useMemo(() => {
    if (!data) return []
    if (query.trim()) return searchVocab(data.words, query)
    return []
  }, [data, query])

  const byLetter = useMemo(() => (data ? groupByLetter(data.words) : new Map()), [data])

  const browseList = useMemo(() => {
    if (!data) return []
    let list = query.trim() ? [] : [...(byLetter.get(letter) ?? [])]
    if (sort === 'rank') list = list.sort((a, b) => (a.rank || 99999) - (b.rank || 99999))
    else list = list.sort((a, b) => a.word.localeCompare(b.word))
    if (onlyUnmastered) list = list.filter((w) => !mastered[w.word])
    return list
  }, [data, byLetter, letter, sort, onlyUnmastered, mastered])

  function toggleMastered(word: string) {
    const next = { ...mastered, [word]: !mastered[word] }
    setMastered(next)
    saveMasteredWords(next)
  }

  function openWord(word: VocabWord) {
    setActive(word)
    /*
     * 两件事都要做：
     * 1) 把详情面板内部的滚动位置归零 —— 上一个词可能很长，
     *    不重置的话看到的是新词的中段，很容易以为「点了没反应」
     * 2) 手机上详情在列表下方，需要滚过去才看得到
     */
    requestAnimationFrame(() => {
      if (detailRef.current) detailRef.current.scrollTop = 0
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  /** 搜索结果里点某条同义词时，直接跳到那个词 */
  function openByWord(raw: string) {
    const found = index.get(raw.toLowerCase())
    if (found) {
      openWord(found)
    } else {
      toast.info(`「${raw}」不在考研词表内`)
    }
  }

  return (
    <Shell
      route="vocab"
      title="词汇广场"
      crumbs={<span>资料 / 词汇广场</span>}
      actions={
        data ? (
          <>
            <span className="numeric chip chip--ghost">{data.meta.total} 词</span>
            <span className="numeric chip chip--ok">
              已掌握 {Object.values(mastered).filter(Boolean).length}
            </span>
          </>
        ) : null
      }
    >
      <div className="page-head">
        <p className="page-head__eyebrow">
          <IconBook size={12} />
          Vocabulary
        </p>
        <h2 className="page-head__title">词汇广场</h2>
        <p className="page-head__desc">
          考研大纲词 {data?.meta.kaoyan ?? '—'} 个，另附补充词 {data?.meta.extra ?? '—'} 个。
          除了查词，每个词都把**相似词串起来**：同义词、同根词形、形近词分三类列出，
          放在一起对比记比单独背牢得多。
        </p>
      </div>

      {loading ? (
        <div className="panel">
          <div className="empty">
            <span className="empty__mark">
              <span className="spinner" />
            </span>
            <h3 className="empty__title">正在准备词汇库</h3>
            <p className="empty__desc">{progress || '正在加载…'}</p>
            <p className="field__desc" style={{ marginTop: 'var(--ds-3)' }}>
              首次使用需下载约 1.1 MB，之后会缓存在本机，离线也能查。
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="note note--danger">
          <span className="note__icon">
            <IconInfo size={13} />
          </span>
          <div className="note__body">
            <p className="note__title">词汇库加载失败</p>
            <p>{error}</p>
          </div>
        </div>
      ) : data ? (
        <div className="vocab-layout">
          {/* —— 左：检索与浏览 —— */}
          <div className="vocab-main">
            <div className="vocab-search">
              <input
                className="input vocab-search__input"
                type="search"
                value={query}
                placeholder="查单词、中文释义、短语或同义词…"
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              {query ? (
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuery('')}>
                  清除
                </button>
              ) : null}
            </div>

            {query.trim() ? (
              <>
                <p className="vocab-count">
                  找到 <strong className="numeric">{hits.length}</strong> 条结果
                  {hits.length >= 60 ? '（已截断，请把关键词写得更具体）' : ''}
                </p>
                <div className="vocab-list">
                  {hits.map((hit) => (
                    <WordRow
                      key={hit.word.word}
                      word={hit.word}
                      snippet={hit.snippet}
                      matchedBy={hit.matchedBy}
                      mastered={Boolean(mastered[hit.word.word])}
                      active={active?.word === hit.word.word}
                      onOpen={() => openWord(hit.word)}
                      onToggle={() => toggleMastered(hit.word.word)}
                    />
                  ))}
                  {hits.length === 0 ? (
                    <div className="note">
                      <span className="note__icon">
                        <IconInfo size={13} />
                      </span>
                      <div className="note__body">
                        <p>
                          没有匹配的词。可以试试中文释义（如「合作」）、短语（如 short of），
                          或同义词（如 insufficient）。
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              </>
            ) : (
              <>
                <div className="vocab-toolbar">
                  <div className="segmented" role="tablist" aria-label="排序">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sort === 'rank'}
                      className="segmented__item"
                      onClick={() => setSort('rank')}
                    >
                      按考频
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={sort === 'alpha'}
                      className="segmented__item"
                      onClick={() => setSort('alpha')}
                    >
                      按字母
                    </button>
                  </div>
                  <label className="vocab-filter">
                    <input
                      type="checkbox"
                      checked={onlyUnmastered}
                      onChange={(e) => setOnlyUnmastered(e.target.checked)}
                    />
                    只看未掌握
                  </label>
                </div>

                <div className="vocab-letters">
                  {[...byLetter.keys()].map((l) => (
                    <button
                      key={l}
                      type="button"
                      className="vocab-letter"
                      aria-current={letter === l}
                      onClick={() => setLetter(l)}
                    >
                      {l}
                    </button>
                  ))}
                </div>

                <p className="vocab-count">
                  首字母 <strong>{letter}</strong> · <span className="numeric">{browseList.length}</span> 词
                </p>

                <div className="vocab-list">
                  {browseList.slice(0, 200).map((word) => (
                    <WordRow
                      key={word.word}
                      word={word}
                      snippet={word.defs.map((d: { pos: string; cn: string }) => `${d.pos} ${d.cn}`).join('；')}
                      mastered={Boolean(mastered[word.word])}
                      active={active?.word === word.word}
                      onOpen={() => openWord(word)}
                      onToggle={() => toggleMastered(word.word)}
                    />
                  ))}
                </div>
                {browseList.length > 200 ? (
                  <p className="field__desc" style={{ textAlign: 'center', marginTop: 'var(--ds-4)' }}>
                    仅显示前 200 个，用搜索更快。共 {browseList.length} 词。
                  </p>
                ) : null}
              </>
            )}
          </div>

          {/* —— 右：词条详情 —— */}
          <aside className="vocab-detail" ref={detailRef}>
            {active ? (
              <WordDetail
                word={active}
                index={index}
                mastered={Boolean(mastered[active.word])}
                onToggle={() => toggleMastered(active.word)}
                onOpenWord={openByWord}
              />
            ) : (
              <div className="panel">
                <div className="empty">
                  <span className="empty__mark">
                    <IconSpark size={18} />
                  </span>
                  <h3 className="empty__title">选一个词</h3>
                  <p className="empty__desc">
                    点左侧任意词条查看释义、例句、短语，以及和它相似的其他词。
                  </p>
                </div>
              </div>
            )}
          </aside>
        </div>
      ) : null}
    </Shell>
  )
}

/* -------------------------------------------------------------------------- */

const MATCH_LABEL: Record<SearchHit['matchedBy'], string> = {
  word: '词形',
  exact: '完全匹配',
  prefix: '前缀',
  def: '释义',
  phrase: '短语',
  synonym: '同义词',
}

function WordRow({
  word,
  snippet,
  matchedBy,
  mastered,
  active,
  onOpen,
  onToggle,
}: {
  word: VocabWord
  snippet: string
  matchedBy?: SearchHit['matchedBy']
  mastered: boolean
  active: boolean
  onOpen: () => void
  onToggle: () => void
}) {
  return (
    <div className={`vrow${mastered ? ' vrow--mastered' : ''}${active ? ' vrow--active' : ''}`}>
      <button type="button" className="vrow__main" onClick={onOpen}>
        <span className="vrow__head">
          <span className="vrow__word">{word.word}</span>
          {word.usphone ? <span className="vrow__phone">/{word.usphone}/</span> : null}
          {word.rank > 0 && word.rank <= 500 ? (
            <span className="chip chip--clay">高频</span>
          ) : null}
          {matchedBy && matchedBy !== 'word' && matchedBy !== 'exact' && matchedBy !== 'prefix' ? (
            <span className="chip">{MATCH_LABEL[matchedBy]}命中</span>
          ) : null}
        </span>
        <span className="vrow__def">{snippet}</span>
      </button>
      <button
        type="button"
        className="vrow__check"
        onClick={onToggle}
        aria-label={mastered ? '取消已掌握' : '标记已掌握'}
        title={mastered ? '取消已掌握' : '标记已掌握'}
      >
        <IconCheck size={13} />
      </button>
    </div>
  )
}

function WordDetail({
  word,
  index,
  mastered,
  onToggle,
  onOpenWord,
}: {
  word: VocabWord
  index: Map<string, VocabWord>
  mastered: boolean
  onToggle: () => void
  onOpenWord: (w: string) => void
}) {
  const links = useMemo(() => buildLinks(word, index), [word, index])

  const grouped = useMemo(() => {
    const map: Record<LinkKind, typeof links> = { synonym: [], form: [], spelling: [] }
    for (const l of links) map[l.kind].push(l)
    return map
  }, [links])

  return (
    <div className="vdetail">
      <header className="vdetail__head">
        <div>
          <h3 className="vdetail__word">{word.word}</h3>
          <p className="vdetail__phones">
            {word.usphone ? <span className="numeric">美 /{word.usphone}/</span> : null}
            {word.ukphone ? <span className="numeric">英 /{word.ukphone}/</span> : null}
            {word.book === 'kaoyan' && word.rank > 0 ? (
              <span className="numeric vdetail__rank">考频序 {word.rank}</span>
            ) : (
              <span className="vdetail__rank">补充词</span>
            )}
          </p>
        </div>
        <button
          type="button"
          className={`btn btn--sm ${mastered ? 'btn--primary' : 'btn--secondary'}`}
          onClick={onToggle}
        >
          <IconCheck size={12} />
          {mastered ? '已掌握' : '标记掌握'}
        </button>
      </header>

      <section className="vdetail__section">
        <h4 className="vdetail__label">释义</h4>
        <ul className="vdefs">
          {word.defs.map((d, i) => (
            <li key={i}>
              {d.pos ? <span className="vdefs__pos">{d.pos}.</span> : null}
              <span>{d.cn}</span>
            </li>
          ))}
        </ul>
      </section>

      {word.sentences.length > 0 ? (
        <section className="vdetail__section">
          <h4 className="vdetail__label">例句</h4>
          {word.sentences.map((s, i) => (
            <div key={i} className="vsentence">
              <p className="vsentence__en">{highlight(s.en, word.word)}</p>
              <p className="vsentence__cn">{s.cn}</p>
            </div>
          ))}
        </section>
      ) : null}

      {word.phrases.length > 0 ? (
        <section className="vdetail__section">
          <h4 className="vdetail__label">短语</h4>
          <ul className="vphrases">
            {word.phrases.map((p, i) => (
              <li key={i}>
                <span className="vphrases__en">{p.en}</span>
                <span className="vphrases__cn">{p.cn}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* —— 相似词串联 —— */}
      <section className="vdetail__section">
        <h4 className="vdetail__label">
          相似词
          <span className="numeric vdetail__count">{links.length}</span>
        </h4>
        {links.length === 0 ? (
          <p className="field__desc">这个词在词表里没有关联词。可试试搜索它的同义词。</p>
        ) : (
          <div className="vlinks">
            {(['synonym', 'form', 'spelling'] as LinkKind[]).map((kind) =>
              grouped[kind].length > 0 ? (
                <div key={kind} className="vlinks__group">
                  <div className="vlinks__group-head">
                    <span className={`vlinks__kind vlinks__kind--${kind}`}>
                      {LINK_KIND_META[kind].name}
                    </span>
                    <span className="vlinks__count numeric">{grouped[kind].length}</span>
                  </div>
                  <p className="vlinks__desc">{LINK_KIND_META[kind].desc}</p>
                  <div className="vlinks__items">
                    {grouped[kind].map((link, i) => (
                      <button
                        key={`${link.word}-${i}`}
                        type="button"
                        className={`vlink${link.inDict ? '' : ' vlink--out'}`}
                        disabled={!link.inDict}
                        onClick={() => onOpenWord(link.word)}
                        title={link.inDict ? link.note : `${link.note}（不在词表内）`}
                      >
                        {link.word}
                        {link.inDict ? null : <span className="vlink__out">词表外</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
          </div>
        )}
      </section>

      <div className="vdetail__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate('templates')}>
          <IconBook size={12} />
          去模板库
        </button>
      </div>
    </div>
  )
}

/** 把例句里的目标词加粗，便于定位 */
function highlight(text: string, word: string) {
  const idx = text.toLowerCase().indexOf(word.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <strong>{text.slice(idx, idx + word.length)}</strong>
      {text.slice(idx + word.length)}
    </>
  )
}
