import { toPng } from 'html-to-image'
import type { ChatImageRenderer } from './exportChatImage'

export const renderChatImage: ChatImageRenderer = (node, options) => toPng(node, options)
