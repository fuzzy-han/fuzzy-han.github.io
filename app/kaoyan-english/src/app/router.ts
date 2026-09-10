import { useEffect, useState } from 'react'

/* ==========================================================================
   极简 hash 路由
   用 hash 而非 history API：纯静态托管 / 双击本地文件打开都能直接用，
   不需要服务端 rewrite 规则，单机工具场景更省事。
   ========================================================================== */

export type RouteName =
  | 'workbench'
  | 'grade'
  | 'report'
  | 'history'
  | 'rubrics'
  | 'models'
  | 'settings'

export interface Route {
  name: RouteName
  /** 形如 ?report=xxx 的参数 */
  query: URLSearchParams
}

const ROUTE_NAMES: RouteName[] = [
  'workbench',
  'grade',
  'report',
  'history',
  'rubrics',
  'models',
  'settings',
]

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const [pathPart, queryPart] = raw.split('?')
  const name = (pathPart || 'workbench') as RouteName
  return {
    name: ROUTE_NAMES.includes(name) ? name : 'workbench',
    query: new URLSearchParams(queryPart ?? ''),
  }
}

export function navigate(name: RouteName, params?: Record<string, string>): void {
  const search = params ? `?${new URLSearchParams(params).toString()}` : ''
  window.location.hash = `#/${name}${search}`
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(parseHash)

  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])

  return route
}
