import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// 样式总入口：必须在 App 之前引入，保证 tokens → components → pages 的层叠顺序
import './styles/index.css'
import { App } from './App'

const container = document.getElementById('root')

if (!container) {
  throw new Error('找不到 #root 挂载点')
}

// 默认落到批改台，避免首次打开是空白 hash
if (!window.location.hash) {
  window.location.hash = '#/workbench'
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
