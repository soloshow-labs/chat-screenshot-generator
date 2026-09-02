import type { ContactCardPayload } from '../../../app/chatTypes'
import styles from '../RichMessage.module.css'

export function ContactCard({ contact, avatar, side }: { contact: ContactCardPayload | null | undefined; avatar: string; side: 'left' | 'right' }) {
  return <div className={styles.contactCard} data-card-kind="contact" data-side={side}>
    <span data-card-tail aria-hidden="true" className={styles.cardTail} />
    <div className={styles.contactIdentity}>
      <img className={styles.contactAvatar} src={avatar} alt="名片头像" />
      <div className={styles.contactText}><strong>{contact?.name || '联系人'}</strong>{contact?.description ? <p>{contact.description}</p> : null}</div>
    </div>
    <footer className={styles.contactFooter}><span>个人名片</span></footer>
  </div>
}
