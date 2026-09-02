import type { Participant } from '../app/chatTypes'
import {
  openApplicationDatabase,
  requestResult,
  STORE_NAMES,
  transactionComplete,
} from './indexedDatabase'

export interface ContactRecord {
  id: string
  name: string
  avatarDataUrl: string | null
  updatedAt: number
}

export interface GroupPresetRecord {
  id: string
  title: string
  participants: Participant[]
  updatedAt: number
}

function newestFirst<T extends { id: string; updatedAt: number }>(records: T[]): T[] {
  return records.sort((first, second) => second.updatedAt - first.updatedAt || first.id.localeCompare(second.id))
}

async function listRecords<T>(storeName: string, errorMessage: string): Promise<T[]> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(storeName, 'readonly')
  return requestResult<T[]>(transaction.objectStore(storeName).getAll(), errorMessage)
}

async function saveRecord<T>(storeName: string, record: T, errorMessage: string): Promise<T> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).put(record)
  await transactionComplete(transaction, errorMessage)
  return record
}

async function deleteRecord(storeName: string, id: string, errorMessage: string): Promise<void> {
  const database = await openApplicationDatabase()
  const transaction = database.transaction(storeName, 'readwrite')
  transaction.objectStore(storeName).delete(id)
  await transactionComplete(transaction, errorMessage)
}

export async function listContacts(): Promise<ContactRecord[]> {
  return newestFirst(await listRecords<ContactRecord>(STORE_NAMES.contacts, '无法读取联系人素材库'))
}

export function saveContact(contact: ContactRecord): Promise<ContactRecord> {
  return saveRecord(STORE_NAMES.contacts, contact, '无法保存联系人')
}

export function deleteContact(id: string): Promise<void> {
  return deleteRecord(STORE_NAMES.contacts, id, '无法删除联系人')
}

export async function listGroupPresets(): Promise<GroupPresetRecord[]> {
  return newestFirst(await listRecords<GroupPresetRecord>(STORE_NAMES.groupPresets, '无法读取群组素材库'))
}

export function saveGroupPreset(group: GroupPresetRecord): Promise<GroupPresetRecord> {
  return saveRecord(STORE_NAMES.groupPresets, group, '无法保存群组模板')
}

export function deleteGroupPreset(id: string): Promise<void> {
  return deleteRecord(STORE_NAMES.groupPresets, id, '无法删除群组模板')
}
