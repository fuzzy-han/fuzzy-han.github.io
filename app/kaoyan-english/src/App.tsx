import { useEffect } from 'react'
import { useRoute } from '@/app/router'
import { WorkbenchPage } from '@/pages/Workbench'
import { GradePage } from '@/pages/Grade'
import { RubricsPage } from '@/pages/Rubrics'
import { ModelsPage } from '@/pages/Models'
import { SettingsPage } from '@/pages/Settings'
import { ReportPage } from '@/pages/Report'
import { HistoryPage } from '@/pages/History'
import { ToastHost } from '@/components/Toast'

export function App() {
  const route = useRoute()

  // 深链进来的页面，切页时把滚动位置带回顶部
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [route.name])

  return (
    <>
      {route.name === 'grade' ? (
        <GradePage taskParam={route.query.get('task')} />
      ) : route.name === 'rubrics' ? (
        <RubricsPage />
      ) : route.name === 'models' ? (
        <ModelsPage />
      ) : route.name === 'settings' ? (
        <SettingsPage />
      ) : route.name === 'report' ? (
        <ReportPage reportId={route.query.get('id')} />
      ) : route.name === 'history' ? (
        <HistoryPage />
      ) : (
        <WorkbenchPage />
      )}
      <ToastHost />
    </>
  )
}
