import { useEffect, useState } from 'react'
import styles from './ChatCanvas.module.css'
import { IosBatteryIcon, IosDoNotDisturbIcon, IosSignalIcon, IosSilentIcon, IosWifiIcon } from './ChatGlyphs'
import type { NetworkType, SignalStrength, ThemeMode } from '../../app/chatTypes'

interface StatusBarProps {
  time: string
  batteryPercent: number
  showSilentIcon: boolean
  followSystemTime?: boolean
  batteryCharging?: boolean
  showDoNotDisturb?: boolean
  networkType: NetworkType
  signalStrength: SignalStrength
  theme: ThemeMode
}

function currentSystemTime(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

export function StatusBar({ time, batteryPercent, showSilentIcon, followSystemTime = false, batteryCharging = false, showDoNotDisturb = false, networkType, signalStrength, theme }: StatusBarProps) {
  const [systemTime, setSystemTime] = useState(currentSystemTime)
  useEffect(() => {
    if (!followSystemTime) return undefined
    const immediate = window.setTimeout(() => setSystemTime(currentSystemTime()), 0)
    const timer = window.setInterval(() => setSystemTime(currentSystemTime()), 30_000)
    return () => { window.clearTimeout(immediate); window.clearInterval(timer) }
  }, [followSystemTime])
  return (
    <div className={styles.statusBar} aria-label="手机状态栏">
      <div className={styles.statusLeft}>
        <div className={styles.statusTime}>{followSystemTime ? systemTime : time}</div>
        {showSilentIcon ? <IosSilentIcon className={styles.silentIcon} aria-label="静音模式" /> : null}
        {showDoNotDisturb ? <IosDoNotDisturbIcon className={styles.doNotDisturbIcon} aria-label="勿扰模式" /> : null}
      </div>
      <div className={styles.statusIcons}>
        <IosSignalIcon className={styles.signalIcon} strength={signalStrength} aria-label={`蜂窝信号 ${signalStrength} 格`} />
        {networkType === 'wifi'
          ? <IosWifiIcon className={styles.wifiIcon} aria-label="Wi-Fi" />
          : <span className={styles.networkText} aria-label="5G 网络">5G</span>}
        <IosBatteryIcon className={styles.batteryIcon} percentage={batteryPercent} charging={batteryCharging} dark={theme === 'dark'} aria-label={batteryCharging ? `正在充电，电量 ${batteryPercent}%` : `电量 ${batteryPercent}%`} />
      </div>
    </div>
  )
}
