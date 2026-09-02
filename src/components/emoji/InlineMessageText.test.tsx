import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InlineMessageText } from './InlineMessageText'

describe('inline emoji mixed text spacing', () => {
  it.each([{ small: false, size: '20px', margin: '1.333px', baseline: '-4px' }, { small: true, size: '16px', margin: '1px', baseline: '-3px' }])('gives adjacent images horizontal room without changing text nodes (small=$small)', ({ small, size, margin, baseline }) => {
    const { container } = render(<div><InlineMessageText text={'你好[微笑][捂脸]\n下一行'} small={small} /></div>)
    const wrapper = container.firstElementChild!
    expect([...wrapper.childNodes].map(node => node.nodeType)).toEqual([Node.TEXT_NODE, Node.ELEMENT_NODE, Node.ELEMENT_NODE, Node.TEXT_NODE])
    expect(wrapper.firstChild?.textContent).toBe('你好')
    expect(wrapper.lastChild?.textContent).toBe('\n下一行')
    for (const image of screen.getAllByRole('img')) expect(image).toHaveStyle({ width: size, height: size, marginLeft: margin, marginRight: margin, marginTop: '0px', marginBottom: '0px', verticalAlign: baseline })
  })
})
