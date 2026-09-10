#!/usr/bin/env node
/* ==========================================================================
   报告页自检（P3）
   前置：先启动 dev server 与假模型服务（pnpm dev / node scripts/mock-model.mjs）
   覆盖：分数环与维度条、逐句折叠卡（默认折叠 → 点击展开 → 再点收起）、
        级别筛选、翻译采分点对照、表达积累、复盘、元信息
   ========================================================================== */

import { openCdp, injectMockModelScript, sleep } from './lib/cdp.mjs'

const cdp = await openCdp({ port: 9402 })
const { ev, waitFor, goto, check, summary, close, resetAppState } = cdp

await goto('workbench', 1800)
// 彻底重置：localStorage + IndexedDB，避免上一次测试的报告累积过来
await resetAppState()
await waitFor(`!!document.querySelector('.task-card')`, 8000, '首屏')
await ev(injectMockModelScript())
await cdp.send('Page.reload')
await sleep(2200)

/** 走一遍批改，返回是否成功 */
async function grade(task, prompt, essay) {
  await goto(`grade?task=${task}`, 2000)
  await ev(`(() => {
    const t = document.querySelectorAll('.grade-textarea')
    const set = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set
    set.call(t[0], ${JSON.stringify(prompt)})
    t[0].dispatchEvent(new Event('input', { bubbles: true }))
    set.call(t[1], ${JSON.stringify(essay)})
    t[1].dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(600)
  await ev(`(() => { const b=[...document.querySelectorAll('.btn')].find(b=>b.textContent.includes('开始批改') && !b.disabled); if (b) b.click() })()`)
  const ok = await waitFor(`location.hash.startsWith('#/report')`, 30000, '报告页')
  await sleep(1200)
  return ok
}

console.log('══ 作文报告 ══')
check(
  '批改完成',
  await grade(
    'eng1_big',
    'Directions: Write an essay of 160-200 words. 图画：两位登山者相互搀扶攀登陡崖，标注 Cooperate.',
    'The picture show two climbers who help each other to climb the mountain. We should learn the spirit of cooperation.',
  ),
)

check('分数环渲染', await ev(`!!document.querySelector('.score-ring')`))
check('总分显示为 15', (await ev(`document.querySelector('.score-ring__number').textContent`)) === '15')
check('档位徽标显示', ((await ev(`document.querySelector('.score-ring__band')?.textContent`)) ?? '').includes('13–16'))
check('切题标签显示', ((await ev(`document.body.innerText`)) ?? '').includes('切题'))
check('维度条 4 条', (await ev(`document.querySelectorAll('.dimbars__row').length`)) === 4)
check('分项依据卡 4 张', (await ev(`document.querySelectorAll('.dimcard').length`)) === 4)
check('引用原文作为依据', ((await ev(`document.querySelector('.dimcard__evidence')?.textContent`)) ?? '').includes('The picture show'))
check('逐句卡 2 张', (await ev(`document.querySelectorAll('.sent').length`)) === 2)
check('逐句卡默认折叠', (await ev(`document.querySelectorAll('.sent__body').length`)) === 0)
check('折叠态可见问题标签', ((await ev(`document.querySelector('.sent__labels')?.textContent`)) ?? '').includes('主谓一致'))

console.log('\n── 折叠交互 ──')
await ev(`document.querySelectorAll('.sent__head')[0].click()`)
await sleep(400)
check('点击后展开', (await ev(`document.querySelectorAll('.sent__body').length`)) === 1)
const body = (await ev(`document.querySelector('.sent__body')?.textContent`)) ?? ''
check('展开显示「原句」', body.includes('原句'))
check('展开显示「问题」', body.includes('主谓不一致'))
check('展开显示「优化后」', body.includes('The picture shows two climbers'))
check('展开显示「讲解」', body.includes('讲解'))
await ev(`document.querySelectorAll('.sent__head')[0].click()`)
await sleep(400)
check('再点收起', (await ev(`document.querySelectorAll('.sent__body').length`)) === 0)

console.log('\n── 级别筛选 ──')
check('筛选项 4 个', (await ev(`document.querySelectorAll('.segmented__item').length`)) === 4)
await ev(`[...document.querySelectorAll('.segmented__item')].find(b=>b.textContent.includes('正确')).click()`)
await sleep(400)
check('筛选「正确」只剩 1 张', (await ev(`document.querySelectorAll('.sent').length`)) === 1)
await ev(`[...document.querySelectorAll('.segmented__item')].find(b=>b.textContent.includes('必须修改')).click()`)
await sleep(400)
check('筛选「必须修改」只剩 1 张', (await ev(`document.querySelectorAll('.sent').length`)) === 1)

console.log('\n── 其余分区 ──')
check('修改后全文区', await ev(`!!document.querySelector('.report-essay')`))
check('表达积累卡存在', (await ev(`document.querySelectorAll('.phrase').length`)) >= 1)
check('段落思路存在', await ev(`!!document.querySelector('.outline')`))
check('优先改进 3 条', (await ev(`document.querySelectorAll('.fixes__item').length`)) === 3)
check('元信息可展开', await ev(`!!document.querySelector('.meta-grid')`))

console.log('\n══ 翻译报告 ══')
check(
  '批改完成',
  await grade(
    'eng1_translation',
    'It is generally agreed that a person of high intelligence is one who can grasp ideas readily.',
    '(1) 人们普遍认为，高智力的人就是能很快抓住想法的人。',
  ),
)
check('翻译维度 3 条', (await ev(`document.querySelectorAll('.dimbars__row').length`)) === 3)
check('翻译不走逐句标签筛选', (await ev(`document.querySelectorAll('.segmented__item').length`)) === 0)
check('翻译逐句卡默认折叠', (await ev(`document.querySelectorAll('.sent__body').length`)) === 0)

await ev(`document.querySelectorAll('.sent__head')[0].click()`)
await sleep(400)
check('展开后出现采分点表', await ev(`!!document.querySelector('.pt-table')`))
check('采分点 3 条', (await ev(`document.querySelectorAll('.pt').length`)) === 3)
check('采分点显示命中状态', ((await ev(`document.querySelector('.pt__status')?.textContent`)) ?? '').trim().length > 0,
  await ev(`document.querySelector('.pt__status')?.textContent`))
check('采分点显示对应英文', ((await ev(`document.querySelector('.pt__en')?.textContent`)) ?? '').includes('generally agreed'))
check('采分点显示「你的译文」', ((await ev(`document.querySelector('.pt__yours')?.textContent`)) ?? '').includes('你的译文'))
const tbody = (await ev(`document.querySelector('.sent__body')?.textContent`)) ?? ''
check('展开含「修改译文」', tbody.includes('修改译文'))
check('展开含「结构讲解」', tbody.includes('结构讲解'))
check('展开含「你的译文」原句', tbody.includes('人们普遍认为'))
check('错别字累计扣分区块', ((await ev(`document.body.innerText`)) ?? '').includes('错别字累计扣分'))

console.log('\n── 历史记录 ──')
await goto('history', 2000)
check('记录列表有 2 条', (await ev(`document.querySelectorAll('.hist-item').length`)) === 2)
check('筛选页签存在', (await ev(`document.querySelectorAll('.hist-filters .grade-tab').length`)) >= 2)
await ev(`[...document.querySelectorAll('.hist-filters .grade-tab')].find(b=>b.textContent.includes('翻译')).click()`)
await sleep(500)
check('按题型筛选生效', (await ev(`document.querySelectorAll('.hist-item').length`)) === 1)
await ev(`[...document.querySelectorAll('.hist-filters .grade-tab')].find(b=>b.textContent.includes('全部')).click()`)
await sleep(500)
await ev(`document.querySelector('.hist-item__main').click()`)
await sleep(1500)
check('点击记录可进入报告页', ((await ev(`location.hash`)) ?? '').startsWith('#/report'))

check('无未捕获异常', cdp.consoleErrors.length === 0, cdp.consoleErrors.join(' | ').slice(0, 200))

const failed = summary()
await close()
process.exit(failed ? 1 : 0)
