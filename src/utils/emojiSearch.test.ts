import { describe, expect, it } from 'vitest'
import { searchEmoji } from './emojiSearch'

describe('searchEmoji', () => {
  it('returns the complete ordered collection for an empty query', () => {
    const result = searchEmoji('  ')
    expect(result).toHaveLength(108)
    expect(result.slice(0, 3).map(emoji => emoji.name)).toEqual(['微笑', '撇嘴', '色'])
  })
  it.each([
    ['微笑', ['微笑']], [' [微笑] ', ['微笑']], ['emm', ['Emm']], ['[oK]', ['OK']],
    ['笑哭', ['破涕为笑']], ['[笑哭]', ['破涕为笑']], ['不存在的表情', []], ['.*', []],
  ])('matches %s using names and existing aliases', (query, names) => {
    expect(searchEmoji(query).map(emoji => emoji.name)).toEqual(names)
  })
  it('matches partial names without duplicating the alias target', () => {
    const result = searchEmoji('笑')
    expect(result.map(emoji => emoji.name)).toEqual(['微笑', '偷笑', '憨笑', '坏笑', '笑脸', '破涕为笑', '奸笑'])
    expect(new Set(result.map(emoji => emoji.id)).size).toBe(result.length)
  })
})
