export const SCRIPT_SNIPPET_STORAGE_KEY = 'chat-screenshot-generator:script-snippets:v1'
export const MAX_SCRIPT_SNIPPETS = 30
export const MAX_SCRIPT_SNIPPET_CHARS = 20_000

export interface ScriptSnippet {
  id: string
  name: string
  text: string
  createdAt: number
  updatedAt: number
}

interface ScriptSnippetFile {
  version: 1
  items: ScriptSnippet[]
}

function validSnippet(value: unknown): value is ScriptSnippet {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ScriptSnippet>
  return typeof item.id === 'string' && typeof item.name === 'string' && typeof item.text === 'string'
    && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt)
    && typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt)
    && item.name.trim().length > 0 && item.text.length > 0 && item.text.length <= MAX_SCRIPT_SNIPPET_CHARS
}

function read(): ScriptSnippet[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SCRIPT_SNIPPET_STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || (parsed as Partial<ScriptSnippetFile>).version !== 1) return []
    const items = (parsed as Partial<ScriptSnippetFile>).items
    if (!Array.isArray(items)) return []
    return items.filter(validSnippet).sort((left, right) => right.updatedAt - left.updatedAt).slice(0, MAX_SCRIPT_SNIPPETS)
  } catch { return [] }
}

function write(items: ScriptSnippet[]): void {
  try {
    localStorage.setItem(SCRIPT_SNIPPET_STORAGE_KEY, JSON.stringify({ version: 1, items } satisfies ScriptSnippetFile))
  } catch {
    throw new Error('无法保存脚本片段，请检查浏览器存储空间')
  }
}

function normalizedName(name: string): string {
  const value = name.trim()
  if (!value) throw new Error('请输入片段名称')
  return value.slice(0, 80)
}

export function getScriptSnippets(): ScriptSnippet[] {
  return read().map(item => ({ ...item }))
}

export function saveScriptSnippet(name: string, text: string, now = Date.now()): ScriptSnippet {
  const title = normalizedName(name)
  if (!text.trim()) throw new Error('脚本内容不能为空')
  if (text.length > MAX_SCRIPT_SNIPPET_CHARS) throw new Error(`脚本片段不能超过 ${MAX_SCRIPT_SNIPPET_CHARS} 个字符`)
  const existing = read()
  if (existing.length >= MAX_SCRIPT_SNIPPETS) throw new Error(`最多保存 ${MAX_SCRIPT_SNIPPETS} 个脚本片段`)
  const item: ScriptSnippet = { id: crypto.randomUUID(), name: title, text, createdAt: now, updatedAt: now }
  write([item, ...existing])
  return { ...item }
}

export function renameScriptSnippet(id: string, name: string, now = Date.now()): ScriptSnippet {
  const title = normalizedName(name)
  const existing = read()
  const current = existing.find(item => item.id === id)
  if (!current) throw new Error('找不到脚本片段')
  const updated = { ...current, name: title, updatedAt: now }
  write([updated, ...existing.filter(item => item.id !== id)])
  return { ...updated }
}

export function deleteScriptSnippet(id: string): void {
  write(read().filter(item => item.id !== id))
}
