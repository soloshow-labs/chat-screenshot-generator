import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMOJI_MANIFEST, EMOJI_BY_TOKEN } from './emojiManifest'
import recorded from './wechatEmojiChecksums.json'

describe('WeChat-style local emoji assets', () => {
  it('bundles the complete named 96px PNG collection without external requests', () => {
    expect(EMOJI_MANIFEST).toHaveLength(108)
    expect(EMOJI_MANIFEST.map(emoji => emoji.name)).toContain('破涕为笑')
    expect(EMOJI_MANIFEST.map(emoji => emoji.name)).toContain('裂开')
    for (const emoji of EMOJI_MANIFEST) {
      expect(emoji.src).toMatch(/\.png(?:\?|$)/)
      expect(emoji.src).not.toMatch(/^https?:/)
      const bytes = readFileSync(resolve('src/components/emoji/assets', `${emoji.name}.png`))
      expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      expect(bytes.readUInt32BE(16)).toBe(96)
      expect(bytes.readUInt32BE(20)).toBe(96)
    }
  })
  it('keeps the selected upstream PNG bytes unchanged and preserves old smile/heart IDs', () => {
    for (const emoji of EMOJI_MANIFEST) {
      const bytes = readFileSync(resolve('src/components/emoji/assets', `${emoji.name}.png`))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe((recorded as Record<string, string>)[emoji.name])
    }
    expect(EMOJI_BY_TOKEN.get('[微笑]')?.id).toBe('smile')
    expect(EMOJI_BY_TOKEN.get('[爱心]')?.id).toBe('heart')
    expect(EMOJI_BY_TOKEN.get('[笑哭]')).toBe(EMOJI_BY_TOKEN.get('[破涕为笑]'))
  })
})
