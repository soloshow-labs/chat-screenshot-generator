import type { Dispatch } from 'react'
import type { ChatAction } from '../../app/chatReducer'
import type { Message, Participant, SystemMessagePayload } from '../../app/chatTypes'
import styles from './MessageEditor.module.css'

export function SystemMessageFields({ message, participants, number, dispatch }: {
  message: Message
  participants: Participant[]
  number: number
  dispatch: Dispatch<ChatAction>
}) {
  const system = message.system ?? { subtype: 'invite', actorId: null, actorName: '', targetId: null, targetName: '', detail: '' }
  const update = (patch: Partial<SystemMessagePayload>) => dispatch({ type: 'update-message', messageId: message.id, patch: { system: { ...system, ...patch } } })
  const chooseParticipant = (field: 'actor' | 'target', id: string) => {
    const participant = participants.find(item => item.id === id)
    update(field === 'actor'
      ? { actorId: participant?.id ?? null, actorName: participant?.name ?? '' }
      : { targetId: participant?.id ?? null, targetName: participant?.name ?? '' })
  }
  const needsTarget = ['invite', 'remove', 'tickle'].includes(system.subtype)
  return <div className={styles.systemFields}>
    <label><span>系统类型</span><select aria-label={`消息 ${number} 系统类型`} value={system.subtype} onChange={event => update({ subtype: event.target.value as SystemMessagePayload['subtype'] })}>
      <option value="invite">邀请加入群聊</option><option value="remove">移出群聊</option><option value="rename">修改群名</option><option value="tickle">拍一拍</option><option value="custom">自定义系统提示</option>
    </select></label>
    {system.subtype !== 'custom' ? <label><span>操作者</span><select aria-label={`消息 ${number} 操作者`} value={system.actorId ?? ''} onChange={event => chooseParticipant('actor', event.target.value)}><option value="">请选择</option>{participants.map(participant => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label> : null}
    {needsTarget ? <label><span>对象</span><select aria-label={`消息 ${number} 对象`} value={system.targetId ?? ''} onChange={event => chooseParticipant('target', event.target.value)}><option value="">请选择</option>{participants.map(participant => <option key={participant.id} value={participant.id}>{participant.name}</option>)}</select></label> : null}
    {system.subtype === 'rename' ? <label><span>新群名</span><input aria-label={`消息 ${number} 新群名`} value={system.detail} onChange={event => update({ detail: event.target.value })} /></label> : null}
    {system.subtype === 'custom' ? <label><span>系统提示</span><textarea rows={2} aria-label={`消息 ${number} 系统提示`} value={system.detail} onChange={event => update({ detail: event.target.value })} /></label> : null}
  </div>
}
