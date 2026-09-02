import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { SettingsPanel } from './SettingsPanel'

describe('SettingsPanel', () => {
  it('presents the calibrated iPhone preset and keeps low-frequency controls collapsed', async () => {
    const user = userEvent.setup()
    render(
      <SettingsPanel
        draft={SAMPLE_DRAFT}
        messages={SAMPLE_DRAFT.messages}
        dispatch={vi.fn()}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: '截图与导出' })).toBeInTheDocument()
    expect(screen.getByLabelText('设备预设')).toHaveValue('iphone-15-pro-max')
    expect(screen.getByText('1290 × 2796 · 3×')).toBeInTheDocument()

    const statusDetails = screen.getByText('手机状态栏').closest('details')
    const outputDetails = screen.getByText('高级输出设置').closest('details')
    expect(statusDetails).not.toHaveAttribute('open')
    expect(outputDetails).not.toHaveAttribute('open')

    await user.click(screen.getByText('高级输出设置'))
    expect(outputDetails).toHaveAttribute('open')
    expect(screen.getByLabelText('输出宽度')).toHaveValue(430)
    expect(screen.getByLabelText('输出高度')).toHaveValue(932)
  })

  it('opens advanced output controls when custom sizing is selected', async () => {
    const user = userEvent.setup()
    render(
      <SettingsPanel
        draft={SAMPLE_DRAFT}
        messages={SAMPLE_DRAFT.messages}
        dispatch={vi.fn()}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('设备预设'), 'custom')

    expect(screen.getByLabelText('设备预设')).toHaveValue('custom')
    expect(screen.getByText('高级输出设置').closest('details')).toHaveAttribute('open')
    expect(screen.getByLabelText('输出宽度')).toBeVisible()
  })

  it('applies a device preset as one draft edit', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(
      <SettingsPanel
        draft={{ ...SAMPLE_DRAFT, outputWidth: 390, outputHeight: 844, exportScale: 2 }}
        messages={SAMPLE_DRAFT.messages}
        dispatch={dispatch}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )

    await user.selectOptions(screen.getByLabelText('设备预设'), 'iphone-15-pro-max')

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'set-fields',
      patch: { outputWidth: 430, outputHeight: 932, exportScale: 3 },
    })
  })

  it('edits the title and appearance settings', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(<SettingsPanel draft={SAMPLE_DRAFT} messages={SAMPLE_DRAFT.messages} dispatch={dispatch} onRequestConversationTypeChange={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('聊天标题'), { target: { value: '新群名' } })
    await user.click(screen.getByRole('button', { name: '浅色' }))
    await user.click(screen.getByRole('button', { name: '聊天长图' }))
    await user.click(screen.getByLabelText('显示状态栏'))
    await user.click(screen.getByRole('button', { name: '5G' }))
    await user.click(screen.getByRole('button', { name: '3 格信号' }))
    await user.click(screen.getByLabelText('显示静音铃铛'))
    await user.click(screen.getByLabelText('跟随系统时间'))
    await user.click(screen.getByLabelText('显示充电状态'))
    await user.click(screen.getByLabelText('显示勿扰状态'))
    await user.click(screen.getByLabelText('显示听筒模式提示'))
    fireEvent.change(screen.getByLabelText('聊天未读数'), { target: { value: '12' } })
    await user.click(screen.getByLabelText('显示输入栏'))
    await user.click(screen.getByLabelText('显示底部横条'))
    await user.click(screen.getByRole('button', { name: '不显示时间' }))

    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'title', value: '新群名' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'theme', value: 'light' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'outputMode', value: 'long' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'showStatusBar', value: false })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'networkType', value: '5g' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'signalStrength', value: 3 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'showSilentIcon', value: false })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'followSystemTime', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'batteryCharging', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'showDoNotDisturb', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'earpieceMode', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'chatUnreadCount', value: 12 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'showInputBar', value: false })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'showHomeIndicator', value: true })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'timeDisplayMode', value: 'hidden' })
  })

  it('edits the input-bar state and quick-sends the draft as one action', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    render(
      <SettingsPanel
        draft={{ ...SAMPLE_DRAFT, inputBarMode: 'text', inputDraft: '待发送内容' } as typeof SAMPLE_DRAFT}
        messages={SAMPLE_DRAFT.messages}
        dispatch={dispatch}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: '语音模式' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'inputBarMode', value: 'voice' })
    fireEvent.change(screen.getByLabelText('输入栏草稿'), { target: { value: '新的草稿' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'inputDraft', value: '新的草稿' })
    await user.click(screen.getByRole('button', { name: '按小美发送' }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      type: 'send-input-draft',
      messageId: expect.any(String),
      sentAt: expect.any(String),
    }))
  })

  it('requests a conversation type change and validates status values', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const onRequestConversationTypeChange = vi.fn()
    render(
      <SettingsPanel
        draft={SAMPLE_DRAFT}
        messages={SAMPLE_DRAFT.messages}
        dispatch={dispatch}
        onRequestConversationTypeChange={onRequestConversationTypeChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: '单聊' }))
    expect(onRequestConversationTypeChange).toHaveBeenCalledWith('direct')

    fireEvent.change(screen.getByLabelText('状态栏时间'), { target: { value: '23:59' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'statusTime', value: '23:59' })

    dispatch.mockClear()
    fireEvent.change(screen.getByLabelText('状态栏时间'), { target: { value: '25:90' } })
    expect(dispatch).not.toHaveBeenCalled()
    const statusError = screen.getByRole('alert')
    expect(statusError).toHaveTextContent('请输入 00:00–23:59')
    expect(screen.getByLabelText('状态栏时间')).toHaveAccessibleDescription('请输入 00:00–23:59')

    fireEvent.change(screen.getByLabelText('电量'), { target: { value: '140' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'batteryPercent', value: 100 })
  })

  it('configures output size and long-image message range', async () => {
    const user = userEvent.setup()
    const dispatch = vi.fn()
    const { rerender } = render(
      <SettingsPanel
        draft={SAMPLE_DRAFT}
        messages={SAMPLE_DRAFT.messages}
        dispatch={dispatch}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )

    expect(screen.getByLabelText('输出宽度')).toHaveValue(430)
    expect(screen.getByLabelText('输出高度')).toHaveValue(932)
    expect(screen.getByLabelText('清晰度倍率')).toHaveValue('3')
    expect(screen.queryByLabelText('开始消息')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('输出宽度'), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText('输出高度'), { target: { value: '5000' } })
    await user.selectOptions(screen.getByLabelText('清晰度倍率'), '4')
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'outputWidth', value: 320 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'outputHeight', value: 3000 })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'exportScale', value: 4 })

    const longDraft = { ...SAMPLE_DRAFT, outputMode: 'long' as const }
    rerender(
      <SettingsPanel
        draft={longDraft}
        messages={SAMPLE_DRAFT.messages}
        dispatch={dispatch}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByLabelText('开始消息')).toBeInTheDocument()
    expect(screen.getByLabelText('结束消息')).toBeInTheDocument()
    expect(screen.getByLabelText('输出宽度')).toBeInTheDocument()
    expect(screen.getByLabelText('清晰度倍率')).toBeInTheDocument()
    expect(screen.queryByLabelText('输出高度')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('开始消息'), 'm2')
    await user.selectOptions(screen.getByLabelText('结束消息'), 'm4')
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'captureStartMessageId', value: 'm2' })
    expect(dispatch).toHaveBeenCalledWith({ type: 'set-field', field: 'captureEndMessageId', value: 'm4' })
  })

  it('shows an error for a reversed long-image range', () => {
    render(
      <SettingsPanel
        draft={{ ...SAMPLE_DRAFT, outputMode: 'long', captureStartMessageId: 'm4', captureEndMessageId: 'm2' }}
        messages={SAMPLE_DRAFT.messages}
        dispatch={vi.fn()}
        onRequestConversationTypeChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('开始消息必须位于结束消息之前')
  })
})
