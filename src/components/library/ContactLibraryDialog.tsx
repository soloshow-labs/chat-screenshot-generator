import { useEffect, useState } from 'react'
import { Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import type { ConversationType, Participant } from '../../app/chatTypes'
import { createInitialAvatar } from '../../services/avatarProcessor'
import type { ContactRecord, GroupPresetRecord } from '../../services/libraryStore'
import styles from './ContactLibraryDialog.module.css'

interface ContactLibraryDialogProps {
  participants: Participant[]
  conversationType: ConversationType
  contacts: ContactRecord[]
  groups: GroupPresetRecord[]
  loading: boolean
  error: string | null
  onSaveParticipant: (participant: Participant) => void
  onRenameContact: (contact: ContactRecord, name: string) => void
  onDeleteContact: (id: string) => void
  onApplyContact: (contact: ContactRecord) => void
  onSaveCurrentGroup: () => void
  onDeleteGroup: (id: string) => void
  onApplyGroup: (group: GroupPresetRecord) => void
  onClose: () => void
}

export function ContactLibraryDialog({
  participants,
  conversationType,
  contacts,
  groups,
  loading,
  error,
  onSaveParticipant,
  onRenameContact,
  onDeleteContact,
  onApplyContact,
  onSaveCurrentGroup,
  onDeleteGroup,
  onApplyGroup,
  onClose,
}: ContactLibraryDialogProps) {
  const [editingContactId, setEditingContactId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="library-title">
      <button type="button" className={styles.backdrop} aria-label="关闭素材库遮罩" onClick={onClose} />
      <section className={styles.dialog}>
        <header className={styles.header}>
          <div>
            <h2 id="library-title">联系人与群组素材库</h2>
            <p>仅保存在当前浏览器</p>
          </div>
          <button type="button" aria-label="关闭素材库" onClick={onClose}><X size={20} /></button>
        </header>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        {loading ? <div className={styles.loading}>正在读取素材库…</div> : null}

        <div className={styles.content}>
          <section className={styles.section} aria-labelledby="current-members-title">
            <div className={styles.sectionTitle}>
              <h3 id="current-members-title">当前成员</h3>
              <span>选择成员保存为联系人</span>
            </div>
            <div className={styles.cards}>
              {participants.map((participant) => (
                <div className={styles.card} key={participant.id}>
                  <img src={participant.avatarDataUrl || createInitialAvatar(participant.name)} alt="" />
                  <div><strong>{participant.name}</strong>{participant.isSelf ? <small>我</small> : null}</div>
                  <button type="button" aria-label={`保存联系人：${participant.name}`} onClick={() => onSaveParticipant(participant)}>
                    <Save size={15} /> 保存
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="saved-contacts-title">
            <div className={styles.sectionTitle}>
              <h3 id="saved-contacts-title">已存联系人</h3>
              <span>{contacts.length} 位</span>
            </div>
            {contacts.length === 0 ? <div className={styles.empty}>还没有保存联系人。</div> : (
              <div className={styles.cards}>
                {contacts.map((contact) => (
                  <div className={styles.card} key={contact.id}>
                    <img src={contact.avatarDataUrl || createInitialAvatar(contact.name)} alt="" />
                    <div>
                      {editingContactId === contact.id ? (
                        <input
                          className={styles.contactNameInput}
                          aria-label={`联系人 ${contact.id} 昵称`}
                          value={editingName}
                          onChange={(event) => setEditingName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && editingName.trim()) {
                              onRenameContact(contact, editingName.trim())
                              setEditingContactId(null)
                            }
                          }}
                          autoFocus
                        />
                      ) : <strong>{contact.name}</strong>}
                      <small>{new Date(contact.updatedAt).toLocaleDateString()}</small>
                    </div>
                    <button type="button" aria-label={`添加联系人 ${contact.id}`} onClick={() => onApplyContact(contact)}>
                      <Plus size={15} /> 添加
                    </button>
                    {editingContactId === contact.id ? (
                      <button
                        type="button"
                        aria-label={`保存联系人 ${contact.id}`}
                        disabled={!editingName.trim()}
                        onClick={() => {
                          onRenameContact(contact, editingName.trim())
                          setEditingContactId(null)
                        }}
                      >
                        <Save size={15} /> 保存
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.iconButton}
                        aria-label={`重命名联系人 ${contact.id}`}
                        onClick={() => {
                          setEditingContactId(contact.id)
                          setEditingName(contact.name)
                        }}
                      >
                        <Pencil size={15} />
                      </button>
                    )}
                    <button type="button" className={styles.deleteButton} aria-label={`删除联系人 ${contact.id}`} onClick={() => onDeleteContact(contact.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={styles.section} aria-labelledby="saved-groups-title">
            <div className={styles.sectionTitle}>
              <h3 id="saved-groups-title">群组模板</h3>
              {conversationType === 'group' ? (
                <button type="button" onClick={onSaveCurrentGroup}><Save size={15} /> 保存当前群组</button>
              ) : null}
            </div>
            {groups.length === 0 ? <div className={styles.empty}>还没有保存群组模板。</div> : (
              <div className={styles.groups}>
                {groups.map((group) => (
                  <div className={styles.groupCard} key={group.id}>
                    <div><strong>{group.title}</strong><span>{group.participants.length} 人</span></div>
                    <button type="button" aria-label={`应用群组：${group.title}`} onClick={() => onApplyGroup(group)}>应用</button>
                    <button type="button" className={styles.deleteButton} aria-label={`删除群组 ${group.id}`} onClick={() => onDeleteGroup(group.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  )
}
