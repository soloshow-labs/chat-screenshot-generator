import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { ScriptPanel } from './ScriptPanel'

beforeEach(() => localStorage.clear())

it('saves, loads, renames, and deletes local script snippets without applying the draft', async () => {
  const user = userEvent.setup()
  render(<ScriptPanel draft={SAMPLE_DRAFT} onApply={() => undefined} />)
  await user.type(screen.getByLabelText('聊天脚本'), '小美：季度汇报')
  await user.type(screen.getByLabelText('片段名称'), '工作脚本')
  await user.click(screen.getByRole('button', { name: '保存片段' }))
  expect(screen.getByRole('option', { name: '工作脚本' })).toBeInTheDocument()

  await user.clear(screen.getByLabelText('聊天脚本'))
  await user.type(screen.getByLabelText('聊天脚本'), '临时内容')
  await user.click(screen.getByRole('button', { name: '载入片段' }))
  expect(screen.getByLabelText('聊天脚本')).toHaveValue('小美：季度汇报')

  await user.clear(screen.getByLabelText('片段名称'))
  await user.type(screen.getByLabelText('片段名称'), '每日工作')
  await user.click(screen.getByRole('button', { name: '重命名片段' }))
  expect(screen.getByRole('option', { name: '每日工作' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '删除片段' }))
  expect(screen.queryByRole('option', { name: '每日工作' })).not.toBeInTheDocument()
})
