import { useState } from 'react'
import { createSceneTemplate, SCENE_TEMPLATES } from '../../app/sceneTemplates'
import type { RunProductivityTask } from './ProjectPanel'

export function TemplatePanel({ run }: { run: RunProductivityTask }) {
  const [selected, setSelected] = useState<(typeof SCENE_TEMPLATES)[number] | null>(null)
  return <>
    {SCENE_TEMPLATES.map(template => <article key={template.id}><h3>{template.name}</h3><p>{template.description}</p><button type="button" onClick={() => setSelected(template)}>应用{template.name}</button></article>)}
    {selected ? <section role="alert"><p>应用“{selected.name}”将替换当前成员和消息，可以撤销。</p><button type="button" onClick={() => {
      const id = selected.id
      setSelected(null)
      void run(() => createSceneTemplate(id), '模板已应用')
    }}>确认应用模板</button><button type="button" onClick={() => setSelected(null)}>取消应用模板</button></section> : null}
  </>
}
