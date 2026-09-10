/* ==========================================================================
   线上站点自检
   直接打 https://austcoder.cn/kaoyan-english/，确认子路径部署真的可用：
   资源 200、样式生效、六个路由可达、内置细则在、手机端不溢出。
   可用 DSH_LIVE_URL 覆盖目标地址。
   ========================================================================== */

import { openCdp, sleep } from '/home/han/VibeDesign/scripts/lib/cdp.mjs'
const BASE=process.env.DSH_LIVE_URL ?? 'https://austcoder.cn/kaoyan-english/'
const cdp = await openCdp({ port: 9430 })
const { ev, check, summary, close } = cdp

await cdp.send('Page.navigate', { url: BASE })
await sleep(4000)

console.log('── 线上：首屏 ──')
check('应用已挂载', await ev(`!!document.querySelector('.shell')`))
check('标题正确', ((await ev(`document.title`))??'').includes('砚台'))
check('样式生效', ((await ev(`getComputedStyle(document.body).backgroundColor`))??'').includes('250, 249, 245'),
  await ev(`getComputedStyle(document.body).backgroundColor`))
check('侧栏品牌渲染', (await ev(`document.querySelector('.brand-name')?.textContent`))==='砚台')
check('无 console 异常', cdp.consoleErrors.length===0, cdp.consoleErrors.join(' | ').slice(0,200))

console.log('\n── 线上：路由与内置内容 ──')
for (const [hash, sel, name] of [
  ['#/workbench','.task-grid','批改台'],
  ['#/rubrics','.rubric-layout','评分细则'],
  ['#/grade?task=eng1_big','.grade-layout','批改台输入'],
  ['#/models','.provider-grid','模型配置'],
  ['#/settings','.settings-layout','通用设置'],
  ['#/history','.panel','批改记录'],
]) {
  await ev(`location.hash='${hash}'`); await sleep(1300)
  check(`线上可进「${name}」`, await ev(`!!document.querySelector('${sel}')`))
}

await ev(`location.hash='#/rubrics'`); await sleep(1200)
check('三个题型细则均已内置', ((await ev(`document.querySelector('.rubric-textarea')?.value`))??'').length > 2000)
check('细则体检通过', (await ev(`document.querySelector('.checklist__item--warn')`))===null)

console.log('\n── 线上：移动端视口 ──')
await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true})
await ev(`location.hash='#/workbench'`); await sleep(1500)
const mob = await ev(`({ scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth })`)
check('线上手机端无横向溢出', mob.scrollW <= mob.clientW + 1, JSON.stringify(mob))
check('线上手机端有汉堡按钮', ((await ev(`getComputedStyle(document.querySelector('.nav-toggle')).display`))??'')!=='none')

const failed = summary()
await close()
process.exit(failed?1:0)
