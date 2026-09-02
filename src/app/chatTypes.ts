export type ConversationType = 'direct' | 'group'
export type ThemeMode = 'light' | 'dark'
export type MessageSide = 'auto' | 'left' | 'right'
export type MessageKind = 'text' | 'image' | 'voice' | 'call' | 'recall' | 'system' | 'link' | 'video' | 'file' | 'payment' | 'contact' | 'location'
export type DeliveryStatus = 'sent' | 'rejected'
export type TimeDisplayMode = 'smart' | 'hidden'
export type InputBarMode = 'text' | 'voice'
export type MessageTimeVisibility = 'auto' | 'show' | 'hide'
export type NetworkType = 'wifi' | '5g'
export type SignalStrength = 1 | 2 | 3 | 4
export type OutputMode = 'screen' | 'long'
export type ExportScale = 1 | 2 | 3 | 4

export interface Participant {
  id: string
  name: string
  avatarDataUrl: string | null
  isSelf: boolean
}

export interface MediaAttachment {
  assetId: string
  fileName: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
  sizeBytes?: number
  expired?: boolean
  posterDataUrl?: string | null
}

export type ChatWallpaper =
  | { type: 'color'; color: string }
  | { type: 'image'; media: MediaAttachment }
  | null

export interface LinkPayload { title: string; description: string; url: string; thumbnailDataUrl: string | null }
export interface PaymentPayload {
  mode: 'transfer' | 'red-packet'
  amount: number
  note: string
  status: 'pending' | 'received' | 'refunded' | 'expired'
  role?: 'original' | 'receipt' | 'notice'
  payerId?: string | null
  receiverId?: string | null
  payerName?: string
  receiverName?: string
  sourceMessageId?: string | null
}
export interface ContactCardPayload { name: string; avatarDataUrl: string | null; description: string }
export interface LocationPayload { name: string; address: string; mapDataUrl?: string | null }

export interface MessageQuote {
  sourceMessageId: string | null
  senderName: string
  kind: 'text' | 'image'
  text: string
  media: MediaAttachment | null
}

export interface VoicePayload {
  durationMode: 'auto' | 'manual'
  durationSeconds: number
  transcript: string
  showTranscript: boolean
}

export interface SystemMessagePayload {
  subtype: 'invite' | 'remove' | 'rename' | 'tickle' | 'custom'
  actorId: string | null
  actorName: string
  targetId: string | null
  targetName: string
  detail: string
}

export interface CallRecord {
  mode: 'voice' | 'video'
  status: 'duration' | 'cancelled' | 'missed' | 'unanswered'
  durationSeconds: number
}

export interface Message {
  id: string
  participantId: string
  kind: MessageKind
  deliveryStatus?: DeliveryStatus
  text: string
  showReeditLink: boolean
  media: MediaAttachment | null
  quote: MessageQuote | null
  voice: VoicePayload | null
  voiceUnread: boolean
  call: CallRecord | null
  side: MessageSide
  sentAt: string
  timeVisibility: MessageTimeVisibility
  link?: LinkPayload | null
  payment?: PaymentPayload | null
  contactCard?: ContactCardPayload | null
  location?: LocationPayload | null
  system?: SystemMessagePayload | null
}

export interface ChatDraft {
  schemaVersion: 3
  conversationType: ConversationType
  groupMemberCount?: number | null
  showGroupNicknames?: boolean
  title: string
  theme: ThemeMode
  showStatusBar: boolean
  statusTime: string
  batteryPercent: number
  showSilentIcon: boolean
  followSystemTime: boolean
  batteryCharging: boolean
  showDoNotDisturb: boolean
  earpieceMode: boolean
  chatUnreadCount: number
  networkType: NetworkType
  signalStrength: SignalStrength
  outputMode: OutputMode
  captureStartMessageId: string | null
  captureEndMessageId: string | null
  screenScrollTop: number
  outputWidth: number
  outputHeight: number
  exportScale: ExportScale
  showInputBar: boolean
  inputBarMode: InputBarMode
  inputDraft: string
  showHomeIndicator: boolean
  timeDisplayMode: TimeDisplayMode
  wallpaper?: ChatWallpaper
  participants: Participant[]
  messages: Message[]
}
