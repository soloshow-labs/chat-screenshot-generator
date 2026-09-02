import { describe, expect, it } from 'vitest'
import type { ChatDraft } from '../app/chatTypes'
import { SAMPLE_DRAFT } from '../app/sampleDraft'
import { createMessage } from '../app/messageFactory'
import { isChatDraft } from './draftStore'
import { importProject, serializeProject } from './projectFile'

const image = 'data:image/png;base64,aGVsbG8='
function fixture(): ChatDraft {
  return {
    ...structuredClone(SAMPLE_DRAFT), groupMemberCount: 128, showGroupNicknames: false,
    messages: [
      createMessage('self', { id: 'pay', kind: 'payment', payment: { mode: 'transfer', amount: 66, note: '饭钱', status: 'received', role: 'original', payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花', sourceMessageId: null } }),
      createMessage('p2', { id: 'receipt', kind: 'payment', payment: { mode: 'transfer', amount: 66, note: '饭钱', status: 'received', role: 'receipt', payerId: 'self', receiverId: 'p2', payerName: '小美', receiverName: '阿花', sourceMessageId: 'pay' } }),
      createMessage('p2', { id: 'map', kind: 'location', location: { name: '集合点', address: '东门', mapDataUrl: image } }),
    ],
  }
}

describe('group, payment and map draft extensions', () => {
  it('validates automatic or explicitly bounded group display settings without creating members', () => {
    const draft = fixture()
    expect(isChatDraft(draft)).toBe(true)
    expect(isChatDraft({ ...draft, groupMemberCount: null, showGroupNicknames: true })).toBe(true)
    for (const groupMemberCount of [0, -1, 1.5, 100000, '128', NaN]) expect(isChatDraft({ ...draft, groupMemberCount })).toBe(false)
    expect(isChatDraft({ ...draft, showGroupNicknames: 'false' })).toBe(false)
  })

  it('rejects remote, malformed and non-image map payloads', () => {
    for (const mapDataUrl of ['https://example.com/map.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,', 42]) {
      const draft = fixture()
      Object.assign(draft.messages[2].location!, { mapDataUrl })
      expect(isChatDraft(draft)).toBe(false)
    }
  })

  it('rejects malformed payment roles, actor references and invalid response relationships', () => {
    for (const patch of [
      { role: 'other' }, { role: ['receipt'] }, { mode: ['transfer'] }, { status: ['received'] }, { payerId: 42 }, { payerName: null }, { receiverId: 'missing' }, { receiverId: 'self' },
      { role: 'notice' }, { status: 'pending' }, { sourceMessageId: 'receipt' }, { sourceMessageId: 'map' }, { sourceMessageId: 'missing' },
    ]) {
      const draft = fixture()
      Object.assign(draft.messages[1].payment!, patch)
      expect(isChatDraft(draft)).toBe(false)
    }
    const draft = fixture()
    Object.assign(draft.messages[0].payment!, { sourceMessageId: 'receipt' })
    expect(isChatDraft(draft)).toBe(false)
  })

  it('accepts detached snapshots and rejects multiple linked responses to the same source', () => {
    const draft = fixture()
    const duplicate = structuredClone(draft.messages[1])
    duplicate.id = 'another-receipt'
    draft.messages.push(duplicate)
    expect(isChatDraft(draft)).toBe(false)
    Object.assign(duplicate.payment!, { sourceMessageId: null, payerId: null, receiverId: null })
    expect(isChatDraft(draft)).toBe(true)
  })

  it('roundtrips map, group settings and payment snapshots while remapping all live IDs', async () => {
    const draft = fixture()
    const restored = await importProject(await serializeProject(draft))
    const payer = restored.participants.find(person => person.isSelf)!
    const receiver = restored.participants.find(person => person.name === '阿花')!
    expect(restored.groupMemberCount).toBe(128)
    expect(restored.showGroupNicknames).toBe(false)
    expect(restored.messages[2].location?.mapDataUrl).toBe(image)
    expect(restored.messages[0].payment).toMatchObject({ payerId: payer.id, receiverId: receiver.id, payerName: '小美', receiverName: '阿花', sourceMessageId: null })
    expect(restored.messages[1].payment).toMatchObject({ payerId: payer.id, receiverId: receiver.id, payerName: '小美', receiverName: '阿花', sourceMessageId: restored.messages[0].id, amount: 66, note: '饭钱' })
    expect(payer.id).not.toBe('self')
    expect(receiver.id).not.toBe('p2')
    expect(isChatDraft(restored)).toBe(true)
  })

  it('remaps structured system participant references during project import', async () => {
    const draft = fixture()
    draft.messages.push(createMessage('self', { id: 'system', kind: 'system', system: { subtype: 'invite', actorId: 'self', actorName: '小美', targetId: 'p2', targetName: '阿花', detail: '' } }))
    const restored = await importProject(await serializeProject(draft))
    const message = restored.messages.find(item => item.kind === 'system')!
    expect(message.system).toMatchObject({
      actorId: restored.participants.find(item => item.name === '小美')!.id,
      targetId: restored.participants.find(item => item.name === '阿花')!.id,
      actorName: '小美', targetName: '阿花',
    })
  })

  it('repairs only missing payment sources on import and still rejects live cycles', async () => {
    const project = JSON.parse(await serializeProject(fixture()))
    project.draft.messages = project.draft.messages.filter((message: { id: string }) => message.id !== 'pay')
    const restored = await importProject(JSON.stringify(project))
    expect(restored.messages[0].payment?.sourceMessageId).toBeNull()
    expect(restored.messages[0].payment?.payerName).toBe('小美')
    project.draft.messages[0].payment.sourceMessageId = 'receipt'
    await expect(importProject(JSON.stringify(project))).rejects.toThrow()
  })

  it('validates inline map base64 bytes at the project boundary', async () => {
    const draft = fixture()
    draft.messages[2].location!.mapDataUrl = 'data:image/png;base64,AB=='
    await expect(serializeProject(draft)).rejects.toThrow('Base64')
  })
})
