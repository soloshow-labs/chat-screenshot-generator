import { useState } from 'react'
import type { ChatDraft } from '../../app/chatTypes'
import { estimateProjectExportSize, getProjectExportWarning, importProject, MAX_PROJECT_FILE_BYTES, serializeProject } from '../../services/projectFile'

export type RunProductivityTask = (work: (isCurrent: () => boolean) => Promise<ChatDraft | void>, success?: string) => Promise<void>

function readText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('无法读取项目文件'))
    reader.readAsText(file)
  })
}

export function ProjectPanel({ draft, run }: { draft: ChatDraft; run: RunProductivityTask }) {
  const [warning, setWarning] = useState<string | null>(null)
  function download(acknowledged = false) {
    void run(async isCurrent => {
      const bytes = await estimateProjectExportSize(draft)
      if (!isCurrent()) return
      if (bytes > MAX_PROJECT_FILE_BYTES) throw new Error('项目文件超过 150 MB 上限，请减少媒体素材')
      const notice = getProjectExportWarning(bytes)
      if (notice && !acknowledged) { setWarning(notice); return }
      const json = await serializeProject(draft)
      if (!isCurrent()) return
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      try {
        const link = document.createElement('a')
        link.href = url; link.download = `${draft.title || '聊天项目'}.json`
        document.body.append(link); link.click(); link.remove()
        setWarning(null)
      } finally { setTimeout(() => URL.revokeObjectURL(url), 1000) }
    })
  }
  return <>
    <p>JSON 是可继续编辑的项目备份，包含当前项目的成员、消息、设置和原始媒体。导入备份后可在其他浏览器继续编辑；导出的 PNG 只是图片，不能恢复项目。</p>
    <p>备份不包含素材库中独立保存的联系人和常用群组。分享文件前，请检查其中的个人信息。</p>
    <button type="button" onClick={() => download()}>导出项目 JSON</button>
    <label>导入项目 JSON<input type="file" accept=".json,application/json" aria-label="导入项目 JSON" onChange={event => {
      const file = event.target.files?.[0]
      event.target.value = ''
      if (!file) return
      void run(async isCurrent => {
        if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('项目文件超过 150 MB 上限，请减少媒体素材')
        const json = await readText(file)
        if (isCurrent()) return importProject(json)
      }, '项目已导入')
    }} /></label>
    {warning ? <div role="alert"><p>{warning}</p><button type="button" onClick={() => download(true)}>继续导出项目</button><button type="button" onClick={() => setWarning(null)}>取消项目导出</button></div> : null}
  </>
}
