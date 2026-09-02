const resourceMessages = {
  emoji: '导出失败：表情资源无法加载，请刷新后重试导出',
  quote: '导出失败：引用图片无法加载，请重新选择引用图片后重试导出',
  voice: '导出失败：语音资源无法解码，请重新上传音频后重试导出',
  loading: '导出失败：引用图片仍在加载，请稍后重试导出',
  image: '导出失败：图片尚未加载完成或无法解码，请稍后重试或重新上传图片',
  map: '导出失败：地图截图无法加载，请重新上传有效图片',
  wallpaper: '导出失败：聊天背景图片尚未加载完成或无法解码，请重新上传图片',
} as const

/** Only these controlled messages may be surfaced by the export UI. */
export class ExportResourceError extends Error {
  constructor(kind: keyof typeof resourceMessages, options?: ErrorOptions) {
    super(resourceMessages[kind], options)
    this.name = 'ExportResourceError'
  }
}
