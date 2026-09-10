#!/usr/bin/env node
/* ==========================================================================
   可选代理后端

   什么时候需要它：部分服务商不允许浏览器直连（CORS），或者你希望
   API Key 不出现在浏览器里。此时把平台切到「本地代理」通道，
   请求先到这里再转发。

   设计取舍：
   · 默认从请求头读取上游地址与 Key（前端已配置好，无需重复配置）
   · 也支持用环境变量固定上游与 Key，此时前端可以不填 Key
   · 只做转发，不解析、不记录请求内容——批改内容涉及个人写作，不该落盘

   启动：
     node proxy/server.mjs
     # 或固定上游
     UPSTREAM_BASE_URL=https://api.deepseek.com/v1 UPSTREAM_API_KEY=sk-xxx node proxy/server.mjs
   ========================================================================== */

import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL } from 'node:url'

const PORT = Number(process.env.PORT ?? 8787)
const HOST = process.env.HOST ?? '127.0.0.1'

/** 访问口令；设置后前端必须带上同样的 token。留空表示不鉴权 */
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? ''

/** 若设置，则忽略前端传来的上游地址与 Key */
const FIXED_BASE_URL = process.env.UPSTREAM_BASE_URL ?? ''
const FIXED_API_KEY = process.env.UPSTREAM_API_KEY ?? ''

/** 允许的跨域来源，默认放开本机开发端口 */
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN ?? '*'

/** 请求体上限，防止误配置导致内存爆掉 */
const MAX_BODY = Number(process.env.MAX_BODY_BYTES ?? 32 * 1024 * 1024)

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    ...headers,
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error(`请求体超过上限 ${MAX_BODY} 字节`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    })
    res.end()
    return
  }

  if (req.url === '/health' || req.url === '/') {
    send(res, 200, {
      ok: true,
      service: 'kaoyan-writing-coach proxy',
      fixedUpstream: FIXED_BASE_URL || null,
      authRequired: Boolean(ACCESS_TOKEN),
    })
    return
  }

  if (!req.url?.startsWith('/v1/chat/completions')) {
    send(res, 404, { error: { message: '只支持 POST /v1/chat/completions' } })
    return
  }

  if (req.method !== 'POST') {
    send(res, 405, { error: { message: '只支持 POST' } })
    return
  }

  if (ACCESS_TOKEN) {
    const provided = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
    if (provided !== ACCESS_TOKEN) {
      send(res, 401, { error: { message: '代理口令不正确' } })
      return
    }
  }

  // 上游地址与 Key：环境变量优先，否则取前端透传的请求头
  const baseUrl = FIXED_BASE_URL || String(req.headers['x-upstream-base-url'] ?? '').trim()
  const apiKey = FIXED_API_KEY || String(req.headers['x-upstream-api-key'] ?? '').trim()

  if (!baseUrl) {
    send(res, 400, { error: { message: '缺少上游地址：请在平台设置里填写 Base URL，或给代理设置 UPSTREAM_BASE_URL' } })
    return
  }
  if (!apiKey) {
    send(res, 400, { error: { message: '缺少 API Key：请在平台里填写，或给代理设置 UPSTREAM_API_KEY' } })
    return
  }

  let target
  try {
    target = new URL('chat/completions', baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)
  } catch {
    send(res, 400, { error: { message: `上游地址不合法：${baseUrl}` } })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (err) {
    send(res, 413, { error: { message: err.message } })
    return
  }

  const isHttps = target.protocol === 'https:'
  const doRequest = isHttps ? httpsRequest : httpRequest

  const upstream = doRequest(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
        Accept: req.headers.accept ?? 'application/json',
      },
    },
    (upstreamRes) => {
      // 原样回传状态与内容类型，流式响应才能正确逐块透出
      res.writeHead(upstreamRes.statusCode ?? 502, {
        'Content-Type': upstreamRes.headers['content-type'] ?? 'application/json',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': ALLOW_ORIGIN,
      })
      upstreamRes.pipe(res)
    },
  )

  upstream.on('error', (err) => {
    send(res, 502, {
      error: { message: `连接上游失败：${err.message}`, type: 'upstream_error' },
    })
  })

  upstream.setTimeout(300000, () => {
    upstream.destroy(new Error('上游响应超时'))
  })

  upstream.end(body)
})

server.listen(PORT, HOST, () => {
  console.log(`砚台代理已启动  http://${HOST}:${PORT}`)
  console.log(`  健康检查      GET  http://${HOST}:${PORT}/health`)
  console.log(`  转发端点      POST http://${HOST}:${PORT}/v1/chat/completions`)
  console.log(`  固定上游      ${FIXED_BASE_URL || '（未设置，由前端请求头指定）'}`)
  console.log(`  访问口令      ${ACCESS_TOKEN ? '已启用' : '未启用'}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
  })
}
