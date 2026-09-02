import { useState } from 'react'
import type { ChatDraft } from '../../app/chatTypes'
import { applyChatScript, parseChatScript, type ChatScriptOptions } from '../../utils/chatScript'
import { messageOptionLabel } from '../../utils/messageSummary'
import {
  deleteScriptSnippet,
  getScriptSnippets,
  renameScriptSnippet,
  saveScriptSnippet,
} from '../../services/scriptSnippetStore'

function scriptEntrySummary(entry: ReturnType<typeof parseChatScript>['entries'][number]): string {
  const prefix = `${entry.time ? `${entry.time} ` : ''}${entry.name} `
  if (entry.kind === 'image') return `${prefix}图片`
  if (entry.kind === 'voice') return `${prefix}语音 ${entry.voice?.durationSeconds ?? 0} 秒${entry.voice?.transcript ? ` · ${entry.voice.transcript}` : ''}`
  if (entry.kind === 'payment' && entry.payment) return `${prefix}${entry.payment.mode === 'transfer' ? '转账' : '红包'} ¥${entry.payment.amount.toFixed(2)}${entry.payment.note ? ` · ${entry.payment.note}` : ''}`
  if (entry.kind === 'system' && entry.system) return `${entry.time ? `${entry.time} ` : ''}系统消息 · ${entry.system.subtype === 'custom' ? entry.system.detail : `${entry.system.actorName} / ${entry.system.targetName || entry.system.detail}`}`
  return `${prefix}${entry.text}`
}

export function ScriptPanel({ draft, onApply }: { draft: ChatDraft; onApply: (draft: ChatDraft) => void }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState<ChatScriptOptions['mode']>('append')
  const [afterId, setAfterId] = useState(draft.messages[0]?.id ?? '')
  const [startTime, setStartTime] = useState(() => {
    const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
  const [interval, setInterval] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [snippetName, setSnippetName] = useState('')
  const [selectedSnippetId, setSelectedSnippetId] = useState('')
  const [snippets, setSnippets] = useState(getScriptSnippets)
  const [snippetNotice, setSnippetNotice] = useState<string | null>(null)
  const parsed = parseChatScript(text)
  const selfAliases = new Set(['我', '自己', '本人', 'me', 'myself'])
  const names = [...new Set(parsed.entries.flatMap(entry => [entry.name, entry.system?.actorName ?? '', entry.system?.targetName ?? '']).filter(Boolean))].filter(name => {
    if (selfAliases.has(name.toLowerCase()) && draft.participants.some(participant => participant.isSelf)) return false
    return !draft.participants.some(participant => participant.name.trim() === name)
  })
  return <>
    <label>聊天脚本<textarea aria-label="聊天脚本" rows={7} value={text} onChange={event => setText(event.target.value)} placeholder={'10:30\n小美：今天有空吗？\n我：[语音 8s] 马上到\n小美：[图片]'} /></label>
    <section aria-label="脚本片段">
      <h3>脚本片段</h3>
      <label>片段名称<input aria-label="片段名称" maxLength={80} value={snippetName} onChange={event => setSnippetName(event.target.value)} placeholder="例如：工作群周报" /></label>
      <label>已保存片段<select aria-label="已保存片段" value={selectedSnippetId} onChange={event => {
        const id = event.target.value
        setSelectedSnippetId(id)
        const selected = snippets.find(item => item.id === id)
        if (selected) setSnippetName(selected.name)
      }}><option value="">选择片段</option>{snippets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div>
        <button type="button" onClick={() => {
          try {
            const saved = saveScriptSnippet(snippetName, text)
            setSnippets(getScriptSnippets()); setSelectedSnippetId(saved.id); setSnippetName(saved.name); setSnippetNotice('片段已保存'); setError(null)
          } catch (cause) { setError(cause instanceof Error ? cause.message : '脚本片段保存失败') }
        }}>保存片段</button>
        <button type="button" disabled={!selectedSnippetId} onClick={() => {
          const selected = snippets.find(item => item.id === selectedSnippetId)
          if (!selected) return
          setText(selected.text); setSnippetName(selected.name); setSnippetNotice('片段已载入'); setError(null)
        }}>载入片段</button>
        <button type="button" disabled={!selectedSnippetId} onClick={() => {
          try {
            renameScriptSnippet(selectedSnippetId, snippetName)
            setSnippets(getScriptSnippets()); setSnippetNotice('片段已重命名'); setError(null)
          } catch (cause) { setError(cause instanceof Error ? cause.message : '脚本片段重命名失败') }
        }}>重命名片段</button>
        <button type="button" disabled={!selectedSnippetId} onClick={() => {
          try {
            deleteScriptSnippet(selectedSnippetId)
            setSnippets(getScriptSnippets()); setSelectedSnippetId(''); setSnippetName(''); setSnippetNotice('片段已删除'); setError(null)
          } catch (cause) { setError(cause instanceof Error ? cause.message : '脚本片段删除失败') }
        }}>删除片段</button>
      </div>
      {snippetNotice ? <p role="status">{snippetNotice}</p> : null}
    </section>
    <details><summary>支持的富消息格式</summary><p>时间单独一行；图片使用 <code>[图片]</code>；语音使用 <code>[语音 8s] 转文字</code>；支付使用 <code>[转账 52.00] 备注</code> 或 <code>[红包 88.00] 祝福语</code>；群事件使用 <code>[系统 邀请] 我|阿花</code>、<code>[系统 移出] 我|阿花</code>、<code>[系统 改群名] 我|新群名</code>、<code>[系统 拍一拍] 我|阿花</code>，自定义提示使用 <code>[系统] 内容</code>。图片导入后再从本地上传。</p></details>
    <p>解析 {parsed.entries.length} 条消息；新增成员 {names.length} 位{names.length ? `：${names.join('、')}` : ''}</p>
    {parsed.errors.map(item => <p role="alert" key={item.line}>第 {item.line} 行：{item.message}</p>)}
    {parsed.entries.length ? <ol aria-label="脚本预览">{parsed.entries.slice(0, 20).map((entry, index) => <li key={`${entry.line ?? index}-${index}`}>{scriptEntrySummary(entry)}</li>)}{parsed.entries.length > 20 ? <li>其余 {parsed.entries.length - 20} 条将在应用时一并导入</li> : null}</ol> : null}
    <label>应用方式<select aria-label="应用方式" value={mode} onChange={event => setMode(event.target.value as ChatScriptOptions['mode'])}><option value="append">追加消息</option><option value="insert">插入指定消息后</option><option value="replace">替换全部消息</option></select></label>
    {mode === 'insert' ? <label>插入位置<select aria-label="插入位置" value={afterId} onChange={event => setAfterId(event.target.value)}>{draft.messages.map((message, index) => <option key={message.id} value={message.id}>{messageOptionLabel(message, index)}</option>)}</select></label> : null}
    <label>起始时间<input aria-label="起始时间" type="datetime-local" value={startTime} onChange={event => setStartTime(event.target.value)} /></label>
    <label>消息间隔（分钟）<input aria-label="消息间隔（分钟）" type="number" min="0" max="1440" value={interval} onChange={event => setInterval(event.target.value)} /></label>
    {error ? <p role="alert">{error}</p> : null}
    <button type="button" disabled={!parsed.entries.length || Boolean(parsed.errors.length) || !startTime || !interval || (mode === 'insert' && !afterId)} onClick={() => {
      try { onApply(applyChatScript(draft, parsed.entries, { mode, afterId, startTime, intervalMinutes: Number(interval) })); setError(null) }
      catch (cause) { setError(cause instanceof Error ? cause.message : '脚本应用失败') }
    }}>应用脚本</button>
  </>
}
