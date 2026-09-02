import 'fake-indexeddb/auto'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { ChatCanvas } from './ChatCanvas'
import { RichMessage } from './RichMessage'
import { MessageEditor } from '../editor/MessageEditor'
import { SAMPLE_DRAFT } from '../../app/sampleDraft'
import { createMessage } from '../../app/messageFactory'
import type { Message } from '../../app/chatTypes'
import { useReducer } from 'react'
import { chatReducer } from '../../app/chatReducer'
import { saveMediaAsset } from '../../services/mediaAssetStore'

function preview(message: Message) { return render(<ChatCanvas draft={{ ...SAMPLE_DRAFT, conversationType: 'group', messages: [message] }} exportMode={false} />) }
it.each([['pending', '待领取'], ['received', '已领取'], ['refunded', '已退还'], ['expired', '已过期']] as const)('renders red packet %s without revealing or mutating its amount', (status, label) => {
  const message = createMessage('p2', { kind: 'payment', payment: { mode: 'red-packet', amount: 88.8, note: '生日快乐', status } })
  preview(message)
  if (status === 'pending') expect(screen.queryByText(label)).not.toBeInTheDocument()
  else expect(screen.getByText(label)).toBeInTheDocument()
  expect(screen.getByText('生日快乐')).toBeInTheDocument()
  expect(screen.queryByText('¥88.80')).not.toBeInTheDocument()
  expect(screen.getByText('微信红包')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: `红包：${label}` }).tagName.toLowerCase()).toBe(status === 'refunded' ? 'svg' : 'img')
  expect(message.payment?.amount).toBe(88.8)
})
it.each([['pending', '待收款'], ['received', '已收款'], ['refunded', '已退还'], ['expired', '已过期']] as const)('shows transfer %s with amount, readable status and dedicated glyph', (status, label) => {
  preview(createMessage('p2', { kind: 'payment', payment: { mode: 'transfer', amount: 88.8, note: '餐费', status } }))
  expect(screen.getByText('¥88.80')).toBeInTheDocument()
  if (status === 'pending') {
    expect(screen.getByText('餐费')).toBeInTheDocument()
    expect(screen.queryByText(label)).not.toBeInTheDocument()
  } else {
    expect(screen.queryByText('餐费')).not.toBeInTheDocument()
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  expect(screen.getByText('微信转账')).toBeInTheDocument()
  expect(screen.getByRole('img', { name: `转账：${label}` }).tagName.toLowerCase()).toBe(status === 'pending' || status === 'received' ? 'img' : 'svg')
})
it('uses distinct transfer glyphs and reuses the closed envelope for expired red packets', () => {
  const message = createMessage('p2', { kind: 'payment' })
  const view = preview(message)
  for (const mode of ['transfer', 'red-packet'] as const) {
    const drawings = []
    for (const status of ['pending', 'received', 'refunded', 'expired'] as const) {
      view.rerender(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [{ ...message, payment: { mode, status, amount: 1, note: '' } }] }} exportMode={false} />)
      const icon = screen.getByRole('img', { name: new RegExp(`^${mode === 'transfer' ? '转账' : '红包'}：`) })
      drawings.push(icon.getAttribute('src') ?? Array.from(icon.querySelectorAll('path')).map(path => path.getAttribute('d')).join('|'))
    }
    expect(new Set(drawings).size).toBe(mode === 'transfer' ? 4 : 3)
    if (mode === 'red-packet') expect(drawings[3]).toBe(drawings[0])
  }
})
it('renders link text without activating unsafe URLs', () => {
  const message = createMessage('p2', { kind: 'link', link: { title: '<b>书籍</b>', description: '摘要', url: 'javascript:alert(1)', thumbnailDataUrl: null } })
  preview(message)
  expect(screen.getByText('<b>书籍</b>')).toBeInTheDocument()
  expect(screen.getByText('摘要')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
it('shows only the domain while preserving the complete safe link destination', () => {
  preview(createMessage('p2', { kind: 'link', link: { title: '周末安排', description: '', url: 'https://example.com/weekend', thumbnailDataUrl: null } }))
  const link = screen.getByRole('link')
  expect(link).toHaveTextContent(/^example.com$/)
  expect(link).toHaveAttribute('href', 'https://example.com/weekend')
})
it('does not request remote thumbnails even when given an untrusted draft', () => {
  preview(createMessage('p2', { kind: 'link', link: { title: '本地预览', description: '', url: '', thumbnailDataUrl: 'https://example.org/tracker.png' } }))
  expect(screen.queryByAltText('链接缩略图')).not.toBeInTheDocument()
})
it.each([['contact', '名片姓名'], ['location', '地点名称'], ['link', '链接标题']] as const)('edits %s payload and renders it', (kind, label) => {
  function Editor() {
    const [draft, dispatch] = useReducer(chatReducer, { ...SAMPLE_DRAFT, messages: [createMessage('p2', { kind })] })
    return <><MessageEditor messages={draft.messages} participants={draft.participants} dispatch={dispatch} /><ChatCanvas draft={draft} exportMode={false} /></>
  }
  render(<Editor />)
  fireEvent.change(screen.getByLabelText(`消息 1 ${label}`), { target: { value: '测试内容' } })
  expect(screen.getByText('测试内容')).toBeInTheDocument()
})
it('opens stored video in a portal with actual media controls and excludes it during export', async () => {
  const asset = await saveMediaAsset(new File(['local'], 'clip.mp4', { type: 'video/mp4' }))
  const message = createMessage('p2', { kind: 'video', media: { assetId: asset.id, fileName: 'clip.mp4', mimeType: 'video/mp4', durationSeconds: 4 } })
  const view = preview(message)
  await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '播放视频' }))
  const dialog = screen.getByRole('dialog', { name: '视频播放' })
  expect(screen.getByTestId('chat-canvas')).not.toContainElement(dialog)
  expect(dialog.querySelector('video')).toHaveAttribute('controls')
  expect(dialog.querySelector('video')?.getAttribute('src')).toMatch(/^blob:/)
  view.rerender(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [message] }} exportMode />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('downloads stored file blobs and opens only safe web links', async () => {
  const asset = await saveMediaAsset(new File(['text'], 'notes.txt', { type: 'text/plain' }))
  const view = preview(createMessage('p2', { kind: 'file', media: { assetId: asset.id, fileName: 'renamed.txt', mimeType: 'text/plain' } }))
  const download = await screen.findByRole('link', { name: '下载文件' })
  expect(download).toHaveAttribute('download', 'renamed.txt')
  expect(download.getAttribute('href')).toMatch(/^blob:/)
  expect(download).toContainElement(screen.getByText('renamed.txt'))
  expect(within(download).getByRole('img', { name: 'TXT 文件' })).toBeInTheDocument()
  expect(screen.queryByText('下载文件')).not.toBeInTheDocument()
  view.unmount()
  preview(createMessage('p2', { kind: 'link', side: 'right', link: { title: '文档', description: '', url: 'https://example.org/docs', thumbnailDataUrl: null } }))
  expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org/docs')
  expect(screen.queryByText('阿花')).not.toBeInTheDocument()
})
it('renders expired attachment without a download link', () => {
  preview(createMessage('p2', { kind: 'file', media: { assetId: 'missing', fileName: 'report.pdf', mimeType: 'application/pdf', sizeBytes: 1024, expired: true } }))
  expect(screen.getByText('report.pdf')).toBeInTheDocument()
  expect(screen.getByText('文件已过期')).toBeInTheDocument()
  expect(screen.queryByRole('link')).not.toBeInTheDocument()
})
it.each(['left', 'right'] as const)('adds a %s-facing tail to a file card', (side) => {
  const participantId = side === 'left' ? 'p2' : 'self'
  preview(createMessage(participantId, {
    kind: 'file',
    side,
    media: { assetId: 'missing', fileName: 'directional.pdf', mimeType: 'application/pdf', expired: true },
  }))
  const card = screen.getByText('directional.pdf').closest('[data-card-kind="file"]')
  expect(card).toHaveAttribute('data-side', side)
  expect(card?.querySelector('[data-card-tail]')).toBeInTheDocument()
})
it.each([['report.final.pdf', 'PDF'], ['archive.ZIP', 'ZIP'], ['README', 'FILE']] as const)('shows a file extension icon for %s', (fileName, extension) => {
  preview(createMessage('p2', { kind: 'file', media: { assetId: 'missing', fileName, mimeType: 'application/octet-stream', expired: true } }))
  expect(screen.getByRole('img', { name: `${extension} 文件` })).toHaveTextContent(extension)
})
it('distinguishes pending and handled payment surfaces without changing card width', () => {
  const message = createMessage('p2', { kind: 'payment', payment: { mode: 'transfer', amount: 25, note: '备注', status: 'pending' } })
  const view = preview(message)
  const pending = getComputedStyle(screen.getByText('微信转账').parentElement!)
  const pendingColor = pending.backgroundColor
  expect(parseFloat(pending.width)).toBeCloseTo(700 / 3, 2)
  view.rerender(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [{ ...message, payment: { ...message.payment!, status: 'received' } }] }} exportMode={false} />)
  const handled = getComputedStyle(screen.getByText('微信转账').parentElement!)
  expect(handled.backgroundColor).not.toBe(pendingColor)
  expect(handled.width).toBe(pending.width)
})

it('keeps the contact avatar at the left of its name and description', () => {
  preview(createMessage('p2', { kind: 'contact', contactCard: { name: '名片姓名', description: '名片描述', avatarDataUrl: 'data:image/png;base64,eA==' } }))
  const avatar = screen.getByAltText('名片头像')
  const name = screen.getByText('名片姓名')
  expect(avatar.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(getComputedStyle(avatar).float).not.toBe('right')
  expect(avatar.parentElement).toHaveStyle({ display: 'flex', flexDirection: 'row' })
  expect(screen.getByText('名片描述')).toBeInTheDocument()
  expect(screen.getByText('个人名片')).toBeInTheDocument()
})
it.each([[0, '0 B'], [500, '500 B'], [1024, '1.0 KB'], [1024 * 1024, '1.0 MB'], [50 * 1024 * 1024, '50.0 MB']])('formats %s-byte file sizes as %s', (sizeBytes, label) => {
  preview(createMessage('p2', { kind: 'file', media: { assetId: 'missing', fileName: 'a.bin', mimeType: 'application/octet-stream', expired: true, sizeBytes: Number(sizeBytes) } }))
  expect(screen.getByText(label)).toBeInTheDocument()
})
it.each([[1920, 1080, '220px', '1920 / 1080'], [1080, 1920, '168.75px', '1080 / 1920'], [undefined, undefined, '220px', '4 / 3'], [4, undefined, '220px', '4 / 3'], [4, 0, '220px', '4 / 3']] as const)('renders an unpadded video cover using %s × %s media geometry', (width, height, cssWidth, aspectRatio) => {
  preview(createMessage('p2', { kind: 'video', media: { assetId: 'missing', fileName: 'clip.mp4', mimeType: 'video/mp4', durationSeconds: 65.2, width, height, posterDataUrl: 'data:image/png;base64,eA==' } }))
  const video = screen.getByRole('button', { name: '播放视频' })
  expect(video).toHaveStyle({ padding: '0px', width: cssWidth, aspectRatio })
  expect(screen.getByText('1:06')).toBeInTheDocument()
  expect(video).toContainElement(screen.getByAltText('视频封面'))
  expect(getComputedStyle(video.parentElement!).padding).not.toBe('13px')
})
it('retains local-only contact/video images and the offline location illustration', () => {
  const contact = createMessage('p2', { kind: 'contact', contactCard: { name: '本地联系人', description: '', avatarDataUrl: 'https://example.org/tracker.png' } })
  const video = createMessage('p2', { kind: 'video', media: { assetId: 'missing', fileName: 'clip.mp4', mimeType: 'video/mp4', posterDataUrl: 'https://example.org/tracker.png' } })
  const location = createMessage('p2', { kind: 'location', location: { name: '公园', address: '公园路 1 号' } })
  render(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [contact, video, location] }} exportMode={false} />)
  expect(screen.getByAltText('名片头像').getAttribute('src')).toMatch(/^data:image\/svg/)
  expect(screen.queryByAltText('视频封面')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: '离线位置示意图' })).toBeInTheDocument()
  expect(screen.getByText('公园路 1 号')).toBeInTheDocument()
})
it('does not carry an open video player into another attachment or message kind', async () => {
  const first = await saveMediaAsset(new File(['first'], 'first.mp4', { type: 'video/mp4' }))
  const second = await saveMediaAsset(new File(['second'], 'second.mp4', { type: 'video/mp4' }))
  const message = createMessage('p2', { kind: 'video', media: { assetId: first.id, fileName: 'first.mp4', mimeType: 'video/mp4' } })
  const view = preview(message)
  await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '播放视频' }))
  expect(screen.getByRole('dialog', { name: '视频播放' })).toBeInTheDocument()
  const replacement = { ...message, media: { assetId: second.id, fileName: 'second.mp4', mimeType: 'video/mp4' } }
  view.rerender(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [replacement] }} exportMode={false} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '播放视频' }))
  view.rerender(<ChatCanvas draft={{ ...SAMPLE_DRAFT, messages: [{ ...replacement, kind: 'file' }] }} exportMode={false} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it.each(['attachment', 'kind'] as const)('invalidates playback and its error after an %s change, including undo to the original video', async change => {
  const first = await saveMediaAsset(new File(['first'], 'first.mp4', { type: 'video/mp4' }))
  const second = await saveMediaAsset(new File(['second'], 'second.mp4', { type: 'video/mp4' }))
  const message = createMessage('p2', { kind: 'video', media: { assetId: first.id, fileName: 'first.mp4', mimeType: 'video/mp4' } })
  const props = { sender: SAMPLE_DRAFT.participants[1], side: 'left' as const, showName: false, exportMode: false }
  const view = render(<RichMessage {...props} message={message} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '播放视频' }))
  fireEvent.error(screen.getByRole('dialog', { name: '视频播放' }).querySelector('video')!)
  expect(screen.getByRole('alert')).toBeInTheDocument()
  const changed: Message = change === 'attachment'
    ? { ...message, media: { assetId: second.id, fileName: 'second.mp4', mimeType: 'video/mp4' } }
    : { ...message, kind: 'file' }
  view.rerender(<RichMessage {...props} message={changed} />)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  if (change === 'attachment') await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  view.rerender(<RichMessage {...props} message={message} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '播放视频' })).toBeEnabled())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '播放视频' }))
  expect(screen.getByRole('dialog', { name: '视频播放' })).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
it('keeps video errors and controls outside the PNG canvas and resets errors on replay', async () => {
  const asset = await saveMediaAsset(new File(['local'], 'clip.mp4', { type: 'video/mp4' }))
  preview(createMessage('p2', { kind: 'video', media: { assetId: asset.id, fileName: 'clip.mp4', mimeType: 'video/mp4' } }))
  const play = screen.getByRole('button', { name: '播放视频' })
  await waitFor(() => expect(play).toBeEnabled())
  fireEvent.click(play)
  fireEvent.error(screen.getByRole('dialog', { name: '视频播放' }).querySelector('video')!)
  const error = screen.getByRole('alert')
  expect(error).toHaveTextContent('浏览器不支持此编码')
  expect(screen.getByTestId('chat-canvas')).not.toContainElement(error)
  fireEvent.click(screen.getByRole('button', { name: '关闭视频' }))
  fireEvent.click(play)
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog', { name: '视频播放' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
