import type { SystemMessagePayload } from '../../app/chatTypes'
import styles from './ChatCanvas.module.css'

function Name({ children }: { children: string }) {
  return <span className={styles.systemName} data-system-name>{children}</span>
}

export function SystemMessage({ system }: { system: SystemMessagePayload | null | undefined }) {
  const value = system ?? { subtype: 'custom' as const, actorId: null, actorName: '', targetId: null, targetName: '', detail: '' }
  const actor = value.actorName || '某人'
  const target = value.targetName || '某人'
  return <div className={styles.systemMessage} data-testid="system-message">
    {value.subtype === 'invite' ? <><Name>{actor}</Name>邀请<Name>{target}</Name>加入了群聊</> : null}
    {value.subtype === 'remove' ? <><Name>{actor}</Name>将<Name>{target}</Name>移出了群聊</> : null}
    {value.subtype === 'rename' ? <><Name>{actor}</Name>修改群名为“{value.detail || '群聊'}”</> : null}
    {value.subtype === 'tickle' ? <><Name>{actor}</Name>拍了拍<Name>{target}</Name></> : null}
    {value.subtype === 'custom' ? value.detail : null}
  </div>
}
