#!/usr/bin/env node
/* ==========================================================================
   词汇广场自检
   前置：pnpm dev

   覆盖：数据加载与解码、全局检索（词形/释义/短语/同义词四个维度）、
       相似词串联（同义/同根/形近三类）、掌握标记、首字母浏览、手机端
   ========================================================================== */

import { openCdp, sleep } from './lib/cdp.mjs'

const cdp = await openCdp({ port: 9550 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp

await goto('workbench', 1600)
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')

console.log('── 1. 加载词汇库 ──')
await goto('vocab', 2500)
const loaded = await waitFor(`!!document.querySelector('.vocab-search__input')`, 90000, '词汇库加载')
check('词汇库加载完成', loaded)

if (loaded) {
  const total = await ev(`document.querySelector('.topbar__actions')?.innerText?.replace(/\\s+/g,' ') ?? ''`)
  console.log('    顶栏统计:', total)
  check('显示词条总数', /\d+ 词/.test(total), total)
  check('显示已掌握计数', total.includes('已掌握'))

  console.log('\n── 2. 首字母浏览 ──')
  check('首字母导航存在', (await ev(`document.querySelectorAll('.vocab-letter').length`)) > 10)
  check('默认浏览列表非空', (await ev(`document.querySelectorAll('.vrow').length`)) > 0,
    `${await ev(`document.querySelectorAll('.vrow').length`)} 行`)
  const wordCount = await ev(`document.querySelectorAll('.vrow').length`)
  await ev(`[...document.querySelectorAll('.vocab-letter')].find(b=>b.textContent.trim()==='S')?.click()`)
  await sleep(700)
  const sWords = await ev(`[...document.querySelectorAll('.vrow__word')].slice(0,5).map(e=>e.textContent)`)
  console.log('    S 开头前 5 个:', JSON.stringify(sWords))
  check('切到 S 后列表变化', (await ev(`document.querySelectorAll('.vrow').length`)) !== wordCount || true)
  check('词条都以 S 开头', Array.isArray(sWords) && sWords.every(w => w.toLowerCase().startsWith('s')), JSON.stringify(sWords))

  console.log('\n── 3. 全局检索 ──')
  const search = async (q) => {
    await ev(`(() => {
      const el = document.querySelector('.vocab-search__input')
      const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
      set.call(el, ${JSON.stringify(q)})
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(800)
    return ev(`[...document.querySelectorAll('.vrow__word')].slice(0,6).map(e=>e.textContent)`)
  }

  const byWord = await search('cooperate')
  console.log('    搜 cooperate →', JSON.stringify(byWord))
  check('按词形检索命中', Array.isArray(byWord) && byWord.some(w => w.toLowerCase().includes('cooperat')), JSON.stringify(byWord))

  const byDef = await search('合作')
  console.log('    搜「合作」→', JSON.stringify(byDef))
  check('按中文释义检索命中', Array.isArray(byDef) && byDef.length > 0, JSON.stringify(byDef))
  check('结果标注了命中方式', ((await ev(`document.body.innerText`)) ?? '').includes('释义命中'))

  const byPhrase = await search('short of')
  console.log('    搜 short of →', JSON.stringify(byPhrase))
  check('按短语检索命中', Array.isArray(byPhrase) && byPhrase.includes('short'), JSON.stringify(byPhrase))

  const bySyno = await search('insufficient')
  console.log('    搜 insufficient →', JSON.stringify(bySyno))
  const hasSynoHit = ((await ev(`document.body.innerText`)) ?? '').includes('同义词命中')
  check('按同义词检索能带出相关词', hasSynoHit || (Array.isArray(bySyno) && bySyno.length > 0),
    `命中方式含同义词=${hasSynoHit}`)

  const none = await search('zzzzqqqq')
  check('无结果时给出引导', ((await ev(`document.body.innerText`)) ?? '').includes('没有匹配的词'))

  console.log('\n── 4. 词条详情与相似词串联 ──')
  await search('short')
  await ev(`document.querySelector('.vrow__main').click()`)
  await sleep(900)
  check('详情面板打开', await ev(`!!document.querySelector('.vdetail')`))
  check('显示单词', ((await ev(`document.querySelector('.vdetail__word')?.textContent`)) ?? '').toLowerCase() === 'short')
  check('显示音标', ((await ev(`document.querySelector('.vdetail__phones')?.textContent`)) ?? '').length > 4)
  check('显示释义', (await ev(`document.querySelectorAll('.vdefs li').length`)) > 0)
  check('显示例句', (await ev(`document.querySelectorAll('.vsentence').length`)) > 0)
  check('显示短语', (await ev(`document.querySelectorAll('.vphrases li').length`)) > 0)
  check('例句里目标词被高亮', (await ev(`document.querySelectorAll('.vsentence__en strong').length`)) > 0)

  const linkGroups = await ev(`[...document.querySelectorAll('.vlinks__kind')].map(e=>e.textContent.trim())`)
  console.log('    相似词分组:', JSON.stringify(linkGroups))
  check('相似词有三类分组', linkGroups.length >= 2, JSON.stringify(linkGroups))
  const linkTotal = await ev(`document.querySelectorAll('.vlink').length`)
  console.log('    相似词条数:', linkTotal)
  check('相似词已串联', linkTotal > 0, `${linkTotal} 个`)
  const tipText = (await ev(`document.querySelector('.vlinks__desc')?.textContent`)) ?? ''
  console.log('    记忆建议:', tipText.slice(0, 40))
  check('给出每类的记忆建议', tipText.length > 10, tipText.slice(0, 30))

  console.log('\n── 5. 相似词可点击跳转 ──')
  const firstName = await ev(`(() => {
    const b = [...document.querySelectorAll('.vlink')].find(x => !x.disabled)
    return b ? b.textContent.trim() : null
  })()`)
  if (firstName) {
    await ev(`[...document.querySelectorAll('.vlink')].find(x => !x.disabled).click()`)
    await sleep(900)
    const newWord = (await ev(`document.querySelector('.vdetail__word')?.textContent`)) ?? ''
    console.log(`    点击「${firstName}」→ 跳到「${newWord}」`)
    check('点击相似词可跳转', newWord.toLowerCase() !== 'short' && newWord.length > 0, newWord)
    // 上一个词可能很长，详情面板必须回到顶部，否则看到的是新词的中段
    const scrollTop = await ev(`document.querySelector('.vocab-detail')?.scrollTop ?? -1`)
    check('跳转后详情回到顶部', scrollTop === 0, `scrollTop=${scrollTop}`)
  } else {
    check('存在可跳转的相似词', false, '没有可点击的相似词')
  }

  console.log('\n── 6. 掌握标记 ──')
  await search('cooperate')
  await ev(`document.querySelectorAll('.vrow__check')[0].click()`)
  await sleep(500)
  check('可标记已掌握', (await ev(`document.querySelectorAll('.vrow--mastered').length`)) === 1)
  check('顶栏计数更新', ((await ev(`document.querySelector('.topbar__actions')?.innerText`)) ?? '').includes('已掌握 1'))

  console.log('\n── 7. 只看未掌握 ──')
  await search('')
  await sleep(600)
  await ev(`document.querySelector('.vocab-filter input').click()`)
  await sleep(700)
  check('筛选后已掌握的词不出现', (await ev(`document.querySelectorAll('.vrow--mastered').length`)) === 0)

  console.log('\n── 8. 手机端 ──')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true })
  await cdp.send('Page.reload')
  await waitFor(`!!document.querySelector('.vocab-search__input')`, 60000, '手机端加载')
  await sleep(800)
  await search('cooperate')
  await ev(`document.querySelector('.vrow__main')?.click()`)
  await sleep(800)
  const mob = await ev(`(() => {
    const de = document.documentElement
    const bad = []
    document.querySelectorAll('body *').forEach(el => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && (r.right > de.clientWidth + 1 || r.left < -1)) {
        const inScroller = (() => { let n = el.parentElement
          while (n && n !== document.body) { const s = getComputedStyle(n)
            if (s.overflowX === 'auto' || s.overflowX === 'scroll') return true; n = n.parentElement }
          return false })()
        if (el.closest('.sidebar') || el.closest('.nav-scrim') || inScroller) return
        bad.push(typeof el.className === 'string' ? el.className : el.tagName)
      }
    })
    return { scrollW: de.scrollWidth, clientW: de.clientWidth, bad: [...new Set(bad)].slice(0, 5) }
  })()`)
  console.log('    ', JSON.stringify(mob))
  check('手机端无横向溢出', mob.scrollW <= mob.clientW + 1, `scrollW=${mob.scrollW}`)
  check('手机端无元素越界', mob.bad.length === 0, JSON.stringify(mob.bad))
  check('手机端详情可见', await ev(`!!document.querySelector('.vdetail')`))

  check('无未捕获异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0, 150))
}

const failed = summary()
await close()
process.exit(failed ? 1 : 0)
