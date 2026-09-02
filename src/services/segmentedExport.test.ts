import { describe, expect, it } from 'vitest'

import { measureMessageSlots, partitionMessageSlots } from './segmentedExport'

describe('segmented export', () => {
  it('packs consecutive messages greedily without changing order', () => {
    expect(partitionMessageSlots([
      { messageId: 'm1', height: 300 },
      { messageId: 'm2', height: 400 },
      { messageId: 'm3', height: 500 },
      { messageId: 'm4', height: 200 },
    ], 800)).toEqual([
      { startMessageId: 'm1', endMessageId: 'm2' },
      { startMessageId: 'm3', endMessageId: 'm4' },
    ])
  })

  it('identifies a message that cannot fit in one segment', () => {
    expect(() => partitionMessageSlots([{ messageId: 'oversized', height: 801 }], 800)).toThrow('oversized')
  })

  it('measures each message together with its preceding time divider and trailing margin', () => {
    const content = document.createElement('div')
    const divider = document.createElement('div')
    const first = document.createElement('div')
    const second = document.createElement('div')
    first.dataset.previewMessage = 'm1'
    second.dataset.previewMessage = 'm2'
    content.append(divider, first, second)
    Object.defineProperty(content, 'scrollHeight', { value: 520 })
    for (const [element, offsetTop] of [[divider, 10], [first, 40], [second, 240]] as const) {
      Object.defineProperty(element, 'offsetTop', { value: offsetTop })
    }

    expect(measureMessageSlots(content)).toEqual([
      { messageId: 'm1', height: 230 },
      { messageId: 'm2', height: 280 },
    ])
  })
})
