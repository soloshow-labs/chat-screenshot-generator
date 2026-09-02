import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useMediaImportTracker, useMediaImportsBusy } from './useMediaImportActivity'

it('keeps concurrent operations busy until each owner finishes or unmounts', () => {
  const observer = renderHook(() => useMediaImportsBusy())
  const first = renderHook(() => useMediaImportTracker())
  const second = renderHook(() => useMediaImportTracker())
  let finishFirst!: () => void, finishSecond!: () => void
  act(() => { finishFirst = first.result.current(); finishSecond = second.result.current() })
  expect(observer.result.current).toBe(true)
  act(() => { finishFirst(); finishFirst() })
  expect(observer.result.current).toBe(true)
  second.unmount()
  expect(observer.result.current).toBe(false)
  act(() => finishSecond())
  expect(observer.result.current).toBe(false)
})
