import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function ChatBackIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 12 24" aria-hidden="true" {...props}>
      <path
        d="M9.5 3.5 1.5 12l8 8.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".9"
      />
    </svg>
  )
}

export function ChatMoreIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M6.75 12c0 .966-.784 1.75-1.75 1.75S3.25 12.966 3.25 12 4.034 10.25 5 10.25 6.75 11.034 6.75 12Zm5.25-1.75c.966 0 1.75.784 1.75 1.75s-.784 1.75-1.75 1.75-1.75-.784-1.75-1.75.784-1.75 1.75-1.75Zm7 0c.966 0 1.75.784 1.75 1.75s-.784 1.75-1.75 1.75-1.75-.784-1.75-1.75.784-1.75 1.75-1.75Z"
        fill="currentColor"
        fillOpacity=".9"
      />
    </svg>
  )
}

export function ChatVoiceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-1.2a8.8 8.8 0 1 0 0-17.6 8.8 8.8 0 0 0 0 17.6Zm.308-3.992A6.77 6.77 0 0 0 14.3 12a6.77 6.77 0 0 0-1.992-4.808l.849-.849A7.97 7.97 0 0 1 15.5 12a7.97 7.97 0 0 1-2.343 5.657l-.849-.849Zm-1.98-1.98A3.98 3.98 0 0 0 11.5 12a3.98 3.98 0 0 0-1.172-2.828l.849-.849A5.18 5.18 0 0 1 12.7 12a5.18 5.18 0 0 1-1.523 3.677l-.849-.849Zm-1.131-1.131L7.5 12l1.697-1.697A2.39 2.39 0 0 1 9.9 12c0 .663-.269 1.263-.703 1.697Z"
        fill="currentColor"
        fillOpacity=".9"
      />
    </svg>
  )
}

export function ChatStickerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-1.2a8.8 8.8 0 1 0 0-17.6 8.8 8.8 0 0 0 0 17.6Zm-6-8.3h12a6 6 0 0 1-12 0Zm1.351 1.2a4.802 4.802 0 0 0 9.298 0H7.351ZM8.5 10.5A1.5 1.5 0 1 1 8.5 7a1.5 1.5 0 0 1 0 3.5Zm7 0A1.5 1.5 0 1 1 15.5 7a1.5 1.5 0 0 1 0 3.5Z"
        fill="currentColor"
        fillOpacity=".9"
      />
    </svg>
  )
}

export function ChatAddIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        d="M11.4 11.4V7h1.2v4.4H17v1.2h-4.4V17h-1.2v-4.4H7v-1.2h4.4ZM12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10Zm0-1.2a8.8 8.8 0 1 0 0-17.6 8.8 8.8 0 0 0 0 17.6Z"
        fill="currentColor"
        fillOpacity=".9"
      />
    </svg>
  )
}

export function ChatKeyboardIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M5.2 5h13.6A3.2 3.2 0 0 1 22 8.2v7.6a3.2 3.2 0 0 1-3.2 3.2H5.2A3.2 3.2 0 0 1 2 15.8V8.2A3.2 3.2 0 0 1 5.2 5Zm0 1.2a2 2 0 0 0-2 2v7.6a2 2 0 0 0 2 2h13.6a2 2 0 0 0 2-2V8.2a2 2 0 0 0-2-2H5.2ZM5.5 8.3h2v1.4h-2V8.3Zm3.7 0h2v1.4h-2V8.3Zm3.7 0h2v1.4h-2V8.3Zm3.7 0h2v1.4h-2V8.3ZM5.5 11.4h2v1.4h-2v-1.4Zm3.7 0h2v1.4h-2v-1.4Zm3.7 0h2v1.4h-2v-1.4Zm3.7 0h2v1.4h-2v-1.4ZM7.4 14.5h9.2v1.4H7.4v-1.4Z" fill="currentColor" fillOpacity=".9" />
    </svg>
  )
}

export function IosSilentIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" {...props}>
      <path
        d="M16.867 10.574 48.438 42.12c.398-.445.609-1.054.609-1.71 0-2.344-2.367-4.453-4.406-6.54-1.547-1.617-1.97-4.945-2.157-7.64-.164-9-2.554-15.211-8.789-17.461-.867-3.047-3.304-5.484-6.75-5.484-3.468 0-5.882 2.437-6.773 5.484-1.242.422-2.344 1.032-3.305 1.805ZM47.922 50.7a1.806 1.806 0 0 0 2.555 0 1.838 1.838 0 0 0 0-2.555L9.25 6.965a1.84 1.84 0 0 0-2.578 0 1.84 1.84 0 0 0 0 2.555l41.25 41.18ZM8.36 43.246h28.242L12.18 18.801c-.493 2.18-.75 4.664-.797 7.43-.188 2.695-.61 6.023-2.156 7.64-2.016 2.086-4.407 4.195-4.407 6.54 0 1.687 1.336 2.835 3.54 2.835Zm18.585 9.469c3.961 0 6.844-2.86 7.149-6.281H19.797c.281 3.421 3.164 6.28 7.148 6.28Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IosDoNotDisturbIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" {...props}>
      <path d="M13.8 14.65A7 7 0 0 1 6.15 4.2a6 6 0 1 0 7.65 10.45Z" fill="currentColor" />
    </svg>
  )
}

export function IosEarpieceIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path d="M6.8 10.7c0-4.2 2.4-7 5.9-7 3.4 0 5.7 2.4 5.7 5.8 0 2.6-1.4 4.1-3.2 5.3-1.5 1-2 1.7-2.4 3.3-.4 2-1.7 3.2-3.4 3.2-2 0-3.5-1.4-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10 10.2c0-1.6.9-2.7 2.4-2.7 1.4 0 2.3 1 2.3 2.3 0 1.2-.7 1.9-1.7 2.6-.9.6-1.4 1.3-1.7 2.3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function IosWifiIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 56 56" aria-hidden="true" {...props}>
      <path
        d="M5.465 25.035c.445.446 1.101.422 1.523-.023 5.532-5.883 12.844-8.977 21.024-8.977 8.226 0 15.562 3.117 21.07 9 .398.399 1.031.399 1.453-.047l3.117-3.117c.375-.398.375-.914.07-1.289-5.296-6.516-15.257-11.32-25.71-11.32-10.453 0-20.414 4.804-25.711 11.32-.328.375-.305.89.07 1.289l3.094 3.164Zm9.375 9.399c.469.492 1.078.445 1.523-.07 2.72-3.024 7.125-5.204 11.649-5.157 4.57-.047 8.953 2.203 11.695 5.227.445.468 1.031.468 1.477-.024l3.492-3.445c.375-.375.422-.867.07-1.266-3.398-4.195-9.703-7.289-16.734-7.289-7.032 0-13.336 3.117-16.735 7.29-.351.398-.304.867.07 1.265l3.493 3.469Zm13.172 12.304c.492 0 .937-.258 1.804-1.101l5.485-5.274c.351-.328.422-.843.117-1.242-1.477-1.898-4.242-3.539-7.406-3.539-3.235 0-6.047 1.711-7.5 3.68-.211.328-.141.773.21 1.101l5.485 5.274c.867.843 1.312 1.101 1.805 1.101Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function IosSignalIcon({ strength = 4, ...props }: IconProps & { strength?: number }) {
  const columns = [
    { x: 0, y: 4.5, height: 4.5 },
    { x: 6, y: 3, height: 6 },
    { x: 12, y: 1.5, height: 7.5 },
    { x: 18, y: 0, height: 9 },
  ]

  return (
    <svg viewBox="0 0 22 15" aria-hidden="true" {...props}>
      {columns.map(({ x, y, height }, index) => (
        <g key={x} opacity={index < strength ? 1 : 0.18} data-signal-column={index + 1}>
          <rect x={x} y={y} width="4" height={height} rx="1.25" fill="currentColor" />
          <rect x={x} y="11" width="4" height="4" rx="1.25" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

export function IosBatteryIcon({ percentage, dark = false, charging = false, ...props }: IconProps & { percentage: number; dark?: boolean; charging?: boolean }) {
  const isFull = percentage === 100
  const isLow = percentage <= 20
  const fill = isFull ? '#34c759' : isLow ? '#ff3b30' : 'currentColor'
  const numberFill = isFull || !dark ? '#ffffff' : '#111111'

  return (
    <svg viewBox="0 0 33 18" aria-hidden="true" {...props}>
      <rect x="0" y=".25" width="30.5" height="17.5" rx="5.2" fill={fill} />
      <path d="M31.65 5.65c.9.42 1.35 1.38 1.35 3.35s-.45 2.93-1.35 3.35v-6.7Z" fill={fill} opacity=".82" />
      {!charging ? <text
        x="15.25"
        y="13.25"
        textAnchor="middle"
        fill={numberFill}
        fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        fontSize="13"
        fontWeight="700"
        letterSpacing="-.45"
      >
        {percentage}
      </text> : <path d="m17.4 2.3-6.1 7.1h3.7l-2.5 6.4 6.2-7.6h-3.8l2.5-5.9Z" fill={numberFill} />}
    </svg>
  )
}
