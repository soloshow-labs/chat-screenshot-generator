import { describe, expect, it } from 'vitest'
import { parseInlineEmoji } from './inlineEmoji'

describe('parseInlineEmoji', () => {
  it('mixes known local tokens and preserves ordinary text and newlines', () => {
    expect(parseInlineEmoji('你好[微笑][爱心]\n再见')).toEqual([
      { type: 'text', text: '你好' }, { type: 'emoji', id: 'smile' },
      { type: 'emoji', id: 'heart' }, { type: 'text', text: '\n再见' },
    ])
  })
  it('preserves unknown tokens and HTML as literal text', () => {
    expect(parseInlineEmoji('<img src=x onerror=alert(1)>[未知]')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)>[未知]' },
    ])
  })
  it('accepts the canonical WeChat name and retains the earlier shorthand for literal fallback', () => {
    expect(parseInlineEmoji('[破涕为笑][笑哭]')).toEqual([
      { type: 'emoji', id: 'joy' }, { type: 'emoji', id: 'joy', token: '[笑哭]' },
    ])
  })
  it.each([
    [String.raw`\[微笑]`, [{ type: 'text', text: '[微笑]' }]],
    [String.raw`\\[微笑]`, [{ type: 'text', text: '\\' }, { type: 'emoji', id: 'smile' }]],
    [String.raw`\\\[微笑]`, [{ type: 'text', text: String.raw`\[微笑]` }]],
    [String.raw`\\\\[微笑]`, [{ type: 'text', text: '\\\\' }, { type: 'emoji', id: 'smile' }]],
    [String.raw`\[未知]\abc\\`, [{ type: 'text', text: String.raw`\[未知]\abc\\` }]],
    ['', []],
  ])('only applies paired-backslash escaping before known tokens: %s', (text, expected) => {
    expect(parseInlineEmoji(text)).toEqual(expected)
  })
})
