import { useEffect, useRef, useState, type Dispatch } from 'react'
import { LibraryBig, Plus, Trash2, Upload, UserRoundCheck } from 'lucide-react'
import type { ChatAction } from '../../app/chatReducer'
import type { Participant } from '../../app/chatTypes'
import { createInitialAvatar } from '../../services/avatarProcessor'
import { LazyAvatarCropDialog } from '../shared/LazyAvatarCropDialog'
import styles from './MemberList.module.css'

interface MemberListProps {
  participants: Participant[]
  dispatch: Dispatch<ChatAction>
  onRequestRemove: (participantId: string) => void
  onOpenLibrary?: () => void
}

function nextParticipantId(): string {
  return typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `participant-${Date.now()}`
}

export function MemberList({ participants, dispatch, onRequestRemove, onOpenLibrary }: MemberListProps) {
  const [crop, setCrop] = useState<{ participantId: string; file: File; token: number } | null>(null)
  const generation = useRef(0)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  if (crop && !participants.some(participant => participant.id === crop.participantId)) setCrop(null)

  function updateAvatar(participantId: string, file?: File) {
    if (!file) return
    setCrop({ participantId, file, token: ++generation.current })
  }

  return (
    <section className={styles.panel} aria-labelledby="member-list-title">
      <div className={styles.header}>
        <h2 id="member-list-title">成员列表</h2>
        <div className={styles.headerActions}>
          <span>{participants.length} 人</span>
          <button type="button" aria-label="打开素材库" onClick={onOpenLibrary}>
            <LibraryBig size={15} /> 素材库
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {participants.map((participant) => (
          <div className={styles.member} key={participant.id}>
            <label className={styles.avatarButton}>
              <img src={participant.avatarDataUrl || createInitialAvatar(participant.name)} alt="" />
              <span><Upload size={13} /></span>
              <input
                type="file"
                aria-label={`更换头像：${participant.name}`}
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  event.currentTarget.focus()
                  updateAvatar(participant.id, file)
                }}
              />
            </label>
            <label className={styles.nameField}>
              <span className={styles.srOnly}>{`昵称：${participant.name}`}</span>
              <input
                aria-label={`昵称：${participant.name}`}
                value={participant.name}
                onChange={(event) => dispatch({
                  type: 'update-participant',
                  participantId: participant.id,
                  patch: { name: event.target.value },
                })}
              />
              {participant.isSelf ? <small>我</small> : null}
            </label>
            {participant.isSelf ? (
              <span className={styles.selfIcon} role="img" aria-label="当前是我"><UserRoundCheck size={18} /></span>
            ) : (
              <button
                type="button"
                className={styles.iconButton}
                aria-label={`设为我：${participant.name}`}
                onClick={() => dispatch({ type: 'mark-self', participantId: participant.id })}
              >
                <UserRoundCheck size={18} />
              </button>
            )}
            <button
              type="button"
              className={`${styles.iconButton} ${styles.deleteButton}`}
              aria-label={`删除成员：${participant.name}`}
              disabled={participant.isSelf}
              onClick={() => onRequestRemove(participant.id)}
            >
              <Trash2 size={17} />
            </button>
          </div>
        ))}
      </div>

      {crop && participants.some(participant => participant.id === crop.participantId) ? <LazyAvatarCropDialog key={crop.token} file={crop.file} onCancel={() => { ++generation.current; setCrop(null) }} onConfirm={avatarDataUrl => {
        if (!mounted.current || generation.current !== crop.token || !participants.some(participant => participant.id === crop.participantId)) return
        dispatch({ type: 'update-participant', participantId: crop.participantId, patch: { avatarDataUrl }, separateHistory: true })
        ++generation.current
        setCrop(null)
      }} /> : null}

      <button
        type="button"
        className={styles.addButton}
        onClick={() => dispatch({
          type: 'add-participant',
          participant: { id: nextParticipantId(), name: '新成员', avatarDataUrl: null, isSelf: false },
        })}
      >
        <Plus size={17} /> 添加成员
      </button>
    </section>
  )
}
