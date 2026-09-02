import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  deleteScriptSnippet,
  getScriptSnippets,
  renameScriptSnippet,
  saveScriptSnippet,
  SCRIPT_SNIPPET_STORAGE_KEY,
} from './scriptSnippetStore'

describe('scriptSnippetStore', () => {
  beforeEach(() => localStorage.clear())

  it('saves, renames, orders, and deletes versioned snippets', () => {
    const firstId = '00000000-0000-4000-8000-000000000001'
    const secondId = '00000000-0000-4000-8000-000000000002'
    vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce(firstId).mockReturnValueOnce(secondId)
    saveScriptSnippet('早会', '小美：早上好', 100)
    saveScriptSnippet('晚餐', '阿花：吃什么', 200)
    expect(getScriptSnippets().map(item => item.id)).toEqual([secondId, firstId])
    renameScriptSnippet(firstId, '每日早会', 300)
    expect(getScriptSnippets()[0]).toMatchObject({ id: firstId, name: '每日早会', updatedAt: 300 })
    deleteScriptSnippet(firstId)
    expect(getScriptSnippets()).toHaveLength(1)
    expect(JSON.parse(localStorage.getItem(SCRIPT_SNIPPET_STORAGE_KEY)!)).toMatchObject({ version: 1 })
  })

  it('ignores malformed storage and rejects empty or oversized values', () => {
    localStorage.setItem(SCRIPT_SNIPPET_STORAGE_KEY, '{bad')
    expect(getScriptSnippets()).toEqual([])
    expect(() => saveScriptSnippet(' ', 'content')).toThrow('请输入片段名称')
    expect(() => saveScriptSnippet('name', '')).toThrow('脚本内容不能为空')
    expect(() => saveScriptSnippet('name', 'x'.repeat(20_001))).toThrow('脚本片段不能超过 20000 个字符')
  })
})
