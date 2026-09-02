import type { ThemeMode } from '../../../app/chatTypes'
import styles from '../RichMessage.module.css'

const palettes = {
  light: { land: '#f0eee7', block: '#e8e6df', blockEdge: '#deddd6', park: '#cfe5be', path: '#f3f0dc', tree: '#bad4a5', water: '#acd5e5', waterEdge: '#9bc9da', roadEdge: '#dedbd1', road: '#fff', arterial: '#fff4d1' },
  dark: { land: '#363b3c', block: '#404647', blockEdge: '#4b5150', park: '#435b44', path: '#69715e', tree: '#506b48', water: '#355c6d', waterEdge: '#456d7c', roadEdge: '#333838', road: '#626767', arterial: '#827758' },
} as const

/** An original local illustration, not tiles or a claim about actual geography. */
export function LocalMap({ theme = 'light' }: { theme?: ThemeMode }) {
  // html-to-image deep-clones SVG children without resolving their styles.
  // Literal paint attributes keep this illustration self-contained in PNGs.
  const colors = palettes[theme]
  return <svg className={styles.localMap} viewBox="0 0 240 112" width="240" height="112" role="img" aria-label="离线位置示意图">
    <rect width="240" height="112" fill={colors.land} />
    <g data-map-layer="blocks" fill={colors.block} stroke={colors.blockEdge} strokeWidth=".6">
      <path d="M6 5h30v18H6ZM43 5h27v18H43ZM7 31h24v23H7ZM38 31h32v23H38ZM82 5h23v24H82ZM114 4h34v25h-34ZM83 39h22v15H83ZM118 38h27v19h-27ZM155 5h26v20h-26ZM155 34h29v23h-29ZM9 65h25v18H9ZM43 66h27v18H43ZM85 68h26v31H85ZM121 78h25v22h-25ZM155 77h27v27h-27ZM221 8h19v21h-19ZM220 39h20v23h-20ZM220 77h20v28h-20Z" />
    </g>
    <g data-map-layer="park">
      <path d="M2 90h68v22H2ZM154 62h27v8h-27ZM111 35h6v18h-6Z" fill={colors.park} />
      <path d="M9 106q12-16 25-6t29-3" fill="none" stroke={colors.path} strokeWidth="2" />
      <g fill={colors.tree}><circle cx="14" cy="96" r="3" /><circle cx="47" cy="107" r="3.5" /><circle cx="59" cy="94" r="3" /></g>
    </g>
    <g data-map-layer="water">
      <path d="M194-8c-12 25-2 40 0 56s-14 36-5 70h22c-10-32 3-48 4-67S206 14 218-8Z" fill={colors.water} />
      <path d="M194 0c-10 24 4 39 0 62s-10 34-5 50M218 0c-9 17-3 32-3 51s-13 36-4 61" fill="none" stroke={colors.waterEdge} strokeWidth="1" />
    </g>
    <g data-map-layer="roads" fill="none" strokeLinejoin="round">
      <path d="M-5 27h195M-4 59h190M75-5v125M109-5v70M150-5v122M-5 87h81M116 73h74M35 1v84M218 33h29M216 71h32" stroke={colors.roadEdge} strokeWidth="7" />
      <path d="M-5 27h195M-4 59h190M75-5v125M109-5v70M150-5v122M-5 87h81M116 73h74M35 1v84M218 33h29M216 71h32" stroke={colors.road} strokeWidth="5" />
      <path d="M-8 120 104 66 250 71" stroke={colors.roadEdge} strokeWidth="13" />
      <path d="M-8 120 104 66 250 71" stroke={colors.arterial} strokeWidth="10" />
      <path d="m182 65 35 1m-35 8 35 1" stroke={colors.road} strokeWidth="1.5" />
      <path d="M-8 120 104 66 250 71" stroke={colors.road} strokeWidth="1" strokeDasharray="6 5" />
    </g>
    <g data-map-layer="pin">
      <ellipse cx="120" cy="68" rx="9" ry="3" fill="#000" opacity=".14" />
      <path d="M120 37a11 11 0 0 0-11 11c0 8 11 19 11 19s11-11 11-19a11 11 0 0 0-11-11Z" fill="#f0524d" stroke="#fff" strokeWidth="1.5" />
      <circle cx="120" cy="48" r="4" fill="#fff" />
    </g>
  </svg>
}
