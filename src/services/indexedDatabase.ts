export const DATABASE_NAME = 'chat-screenshot-generator'
export const DATABASE_VERSION = 2

export const STORE_NAMES = {
  mediaAssets: 'mediaAssets',
  contacts: 'contacts',
  groupPresets: 'groupPresets',
  projects: 'projects',
  projectCheckpoints: 'projectCheckpoints',
  appMetadata: 'appMetadata',
} as const

let databasePromise: Promise<IDBDatabase> | null = null

export function openApplicationDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result
      const idStores = [STORE_NAMES.mediaAssets, STORE_NAMES.contacts, STORE_NAMES.groupPresets, STORE_NAMES.projects]
      idStores.forEach((storeName) => {
        if (!database.objectStoreNames.contains(storeName)) {
          database.createObjectStore(storeName, { keyPath: 'id' })
        }
      })
      let checkpoints: IDBObjectStore
      if (!database.objectStoreNames.contains(STORE_NAMES.projectCheckpoints)) {
        checkpoints = database.createObjectStore(STORE_NAMES.projectCheckpoints, { keyPath: 'id' })
      } else {
        checkpoints = request.transaction!.objectStore(STORE_NAMES.projectCheckpoints)
      }
      if (!checkpoints.indexNames.contains('projectId')) checkpoints.createIndex('projectId', 'projectId')
      if (!checkpoints.indexNames.contains('projectIdCreatedAt')) checkpoints.createIndex('projectIdCreatedAt', ['projectId', 'createdAt'])
      if (!database.objectStoreNames.contains(STORE_NAMES.appMetadata)) {
        database.createObjectStore(STORE_NAMES.appMetadata, { keyPath: 'key' })
      }
    }

    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => {
        database.close()
        databasePromise = null
      }
      resolve(database)
    }

    request.onerror = () => {
      databasePromise = null
      reject(new Error('无法打开本地素材存储'))
    }
  })

  return databasePromise
}

export function requestResult<T>(
  request: IDBRequest<T>,
  errorMessage: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error(errorMessage))
  })
}

export function transactionComplete(
  transaction: IDBTransaction,
  errorMessage: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(new Error(errorMessage))
    transaction.onabort = () => reject(new Error(errorMessage))
  })
}
