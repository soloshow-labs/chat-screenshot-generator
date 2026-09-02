import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ClipboardCopy, Download, ImagePlus, MoreHorizontal } from 'lucide-react'
import type { ConversationType, Participant } from './app/chatTypes'
import { useChatDraft } from './app/useChatDraft'
import { SettingsPanel } from './components/editor/SettingsPanel'
import { MemberList } from './components/editor/MemberList'
import { MessageEditor } from './components/editor/MessageEditor'
import { ContactLibraryDialog } from './components/library/ContactLibraryDialog'
import { PreviewStage } from './components/preview/PreviewStage'
import { ChatCanvas } from './components/chat/ChatCanvas'
import { ConversationDialogs, type ConversationDialogState } from './components/shared/ConversationDialogs'
import { ExportQualityDialog } from './components/shared/ExportQualityDialog'
import { Toast } from './components/shared/Toast'
import { DraftRecoveryPanel } from './components/shared/DraftRecoveryPanel'
import { useContactLibrary } from './hooks/useContactLibrary'
import { useMediaAssetCleanup } from './hooks/useMediaAssetCleanup'
import { hasPendingMediaImports, useMediaImportsBusy } from './hooks/useMediaImportActivity'
import { useExportWorkflow } from './hooks/useExportWorkflow'
import { useProjectWorkspace } from './hooks/useProjectWorkspace'
import type { ContactRecord, GroupPresetRecord } from './services/libraryStore'
import { resolveCaptureRange } from './utils/captureRange'
import { createLocalId } from './utils/createLocalId'
import styles from './App.module.css'

const ProductivityDialog = lazy(() => import('./components/editor/ProductivityDialog').then(module => ({ default: module.ProductivityDialog })))
const ProjectManagerDialog = lazy(() => import('./components/projects/ProjectManagerDialog').then(module => ({ default: module.ProjectManagerDialog })))
const SnapshotQueueDialog = lazy(() => import('./components/shared/SnapshotQueueDialog').then(module => ({ default: module.SnapshotQueueDialog })))

type Tab = 'settings' | 'messages' | 'preview'
export default function App() {
  const { draft, dispatch, saveState, reset, historyDrafts, undo, redo, canUndo, canRedo, recoveryError, retryRecovery, recoverDraft } = useChatDraft()
  const projectWorkspace = useProjectWorkspace({ draft, saveState, recoverDraft, enabled: !recoveryError })
  const library = useContactLibrary()
  const mediaImportsBusy = useMediaImportsBusy()
  useMediaAssetCleanup(draft, saveState, historyDrafts, !recoveryError)
  const [activeTab, setActiveTab] = useState<Tab>('settings')
  const [locateRequest, setLocateRequest] = useState<{ messageId: string; sequence: number } | null>(null)
  const [settingsResetKey, setSettingsResetKey] = useState(0)
  const [dialog, setDialog] = useState<ConversationDialogState>(null)
  const [replacementId, setReplacementId] = useState('')
  const [counterpartId, setCounterpartId] = useState('')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [productivityOpen, setProductivityOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [snapshotQueueOpen, setSnapshotQueueOpen] = useState(false)
  const [productivityBusy, setProductivityBusy] = useState(false)
  const mobileActionsRef = useRef<HTMLDetailsElement>(null)
  const captureRangeValid = draft.outputMode !== 'long' || resolveCaptureRange(
    draft.messages,
    draft.captureStartMessageId,
    draft.captureEndMessageId,
  ).valid
  const {
    chatCanvasRef,
    segmentedCanvasRef,
    segmentedDraft,
    exporting,
    exportDelivery,
    exportNotice,
    qualityDelivery,
    qualityIssues,
    setQualityIssues,
    prepareCanvas,
    handleExport,
    handleSegmentedExport,
    stagedSnapshots,
    snapshotQueueBusy,
    removeSnapshot,
    clearSnapshots,
    downloadSnapshot,
    downloadSnapshotZip,
  } = useExportWorkflow({ draft, captureRangeValid, productivityBusy, setActiveTab })
  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const menu = mobileActionsRef.current
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) menu.removeAttribute('open')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') mobileActionsRef.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (hasPendingMediaImports() || exporting || productivityBusy || productivityOpen || projectOpen || snapshotQueueOpen || qualityIssues !== undefined || dialog || libraryOpen || event.altKey || !(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof Element && target.closest('[role="dialog"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo() }
      else if (key === 'y' && event.ctrlKey) { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [undo, redo, exporting, productivityBusy, productivityOpen, projectOpen, snapshotQueueOpen, qualityIssues, dialog, libraryOpen])

  const combinedSaveState = saveState === 'error' || projectWorkspace.status === 'error'
    ? 'error'
    : saveState === 'saving' || projectWorkspace.status === 'loading' || projectWorkspace.status === 'saving'
      ? 'saving'
      : 'saved'
  const modalOpen = productivityOpen || projectOpen || snapshotQueueOpen || qualityIssues !== undefined || exporting

  const otherParticipants = draft.participants.filter((participant) => !participant.isSelf)
  function requestConversationTypeChange(type: ConversationType) {
    if (type === draft.conversationType) return
    if (type === 'group') {
      dispatch({ type: 'set-field', field: 'conversationType', value: type })
      return
    }
    if (draft.participants.length <= 2) {
      dispatch({ type: 'set-field', field: 'conversationType', value: type })
      return
    }
    setCounterpartId(otherParticipants[0]?.id || '')
    setDialog({ type: 'direct' })
  }

  function requestRemove(participantId: string) {
    const hasMessages = draft.messages.some((message) => message.participantId === participantId)
    if (!hasMessages) {
      dispatch({ type: 'remove-participant', participantId })
      return
    }
    setReplacementId('')
    setDialog({ type: 'remove-member', participantId })
  }

  function saveParticipantToLibrary(participant: Participant) {
    void library.addContact({
      id: createLocalId('contact'),
      name: participant.name,
      avatarDataUrl: participant.avatarDataUrl,
      updatedAt: Date.now(),
    })
  }

  function closeMobileActions() {
    mobileActionsRef.current?.removeAttribute('open')
  }

  function applyContactFromLibrary(contact: ContactRecord) {
    if (draft.conversationType === 'direct' && draft.participants.length >= 2) {
      dispatch({ type: 'set-field', field: 'conversationType', value: 'group' })
    }
    dispatch({
      type: 'add-participant',
      participant: {
        id: createLocalId('participant'),
        name: contact.name,
        avatarDataUrl: contact.avatarDataUrl,
        isSelf: false,
      },
    })
  }

  function renameContact(contact: ContactRecord, name: string) {
    void library.addContact({ ...contact, name, updatedAt: Date.now() })
  }

  function saveCurrentGroup() {
    void library.addGroup({
      id: createLocalId('group'),
      title: draft.title,
      participants: draft.participants.map((participant) => ({ ...participant })),
      updatedAt: Date.now(),
    })
  }

  function requestApplyGroup(preset: GroupPresetRecord) {
    setLibraryOpen(false)
    setDialog({ type: 'apply-group', preset })
  }

  if (recoveryError) return <DraftRecoveryPanel error={recoveryError} onRetry={retryRecovery} onRecover={recoverDraft} />

  return (
    <div className={styles.app}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" data-testid="brand-icon" />
          </span>
          <div className={styles.brandText}>
            <h1>聊天截图生成器</h1>
            <div className={styles.saveTools}>
              <span className={styles.saveStatus} role="status" data-save-state={combinedSaveState}>
                {combinedSaveState === 'saved' ? '已保存到此浏览器' : combinedSaveState === 'saving' ? '正在保存…' : '保存失败'}
              </span>
              <button
                type="button"
                className={styles.backupButton}
                disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy || libraryOpen || Boolean(dialog) || projectWorkspace.status === 'loading'}
                onClick={() => { setQualityIssues(undefined); setProjectOpen(true) }}
              >项目</button>
              <details className={styles.storageInfo}>
                <summary>存储说明</summary>
                <div className={styles.storagePopover}>
                  <strong>数据保存在当前浏览器</strong>
                  <p>草稿和上传素材只保存在当前浏览器，不会自动同步到云端或其他设备。</p>
                  <p>清除本站数据会删除这些内容，建议定期导出项目 JSON 备份。</p>
                  <p>备份文件包含消息、头像和原始媒体，分享前请检查。</p>
                </div>
              </details>
              <a
                className={styles.githubLink}
                href="https://github.com/soloshow-labs/chat-screenshot-generator"
                target="_blank"
                rel="noreferrer"
                aria-label="在 GitHub 查看项目"
              >
                <span className={styles.githubMark} aria-hidden="true" />
                <span className={styles.githubLabel}>GitHub</span>
              </a>
            </div>
          </div>
        </div>
        <div className={styles.topActions}>
          <button type="button" className={`${styles.resetButton} ${styles.secondaryTopAction}`} disabled={!canUndo || exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={undo}>撤销</button>
          <button type="button" className={`${styles.resetButton} ${styles.secondaryTopAction}`} disabled={!canRedo || exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={redo}>重做</button>
          <button type="button" className={`${styles.resetButton} ${styles.secondaryTopAction}`} disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy || !captureRangeValid} onClick={() => void handleExport('stage')}>
            <ImagePlus size={17} /> {exporting && exportDelivery === 'stage' ? '暂存中…' : '暂存 PNG'}
          </button>
          <button type="button" className={styles.copyButton} disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy || !captureRangeValid} onClick={() => void handleExport('clipboard')}>
            <ClipboardCopy size={17} /> {exporting && exportDelivery === 'clipboard' ? '复制中…' : '复制 PNG'}
          </button>
          <button type="button" className={styles.exportButton} disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy || !captureRangeValid} onClick={() => void handleExport('download')}>
            <Download size={17} /> {exporting && exportDelivery === 'download' ? '导出中…' : '导出 PNG'}
          </button>
          <details className={styles.moreActions} ref={mobileActionsRef}>
            <summary><MoreHorizontal size={17} />更多操作</summary>
            <div className={styles.moreActionsMenu}>
              <button type="button" className={styles.mobileMenuAction} disabled={!canUndo || exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={() => { undo(); closeMobileActions() }}>撤销</button>
              <button type="button" className={styles.mobileMenuAction} disabled={!canRedo || exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={() => { redo(); closeMobileActions() }}>重做</button>
              <button type="button" disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={() => { setQualityIssues(undefined); setProductivityOpen(true); closeMobileActions() }}>效率工具</button>
              <button type="button" className={styles.mobileMenuAction} disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy || !captureRangeValid} onClick={() => { void handleExport('stage'); closeMobileActions() }}>暂存 PNG</button>
              <button type="button" disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={() => { setSnapshotQueueOpen(true); closeMobileActions() }}>暂存盘（{stagedSnapshots.length}）</button>
              <button type="button" disabled={exporting || productivityOpen || projectOpen || mediaImportsBusy} onClick={() => { setDialog({ type: 'reset' }); closeMobileActions() }}>重置</button>
            </div>
          </details>
        </div>
      </header>

      <nav className={styles.tabs} role="tablist" aria-label="编辑工作区" inert={modalOpen}>
        {([['settings', '设置'], ['messages', '消息'], ['preview', '预览']] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className={styles.workspace} inert={modalOpen || mediaImportsBusy}>
        <aside className={styles.settingsColumn} hidden={activeTab !== 'settings'}>
          <SettingsPanel
            key={settingsResetKey}
            draft={draft}
            messages={draft.messages}
            dispatch={dispatch}
            onRequestConversationTypeChange={requestConversationTypeChange}
            memberList={(
              <MemberList
                participants={draft.participants}
                dispatch={dispatch}
                onRequestRemove={requestRemove}
                onOpenLibrary={() => setLibraryOpen(true)}
              />
            )}
          />
        </aside>
        <div className={styles.messageColumn} hidden={activeTab !== 'messages'}>
          <MessageEditor messages={draft.messages} participants={draft.participants} conversationType={draft.conversationType} dispatch={dispatch} locateRequest={locateRequest} />
        </div>
        <div className={styles.previewColumn} data-testid="preview-panel" hidden={activeTab !== 'preview'}>
          <PreviewStage ref={chatCanvasRef} draft={draft} dispatch={dispatch} onLocateMessage={messageId => {
            setActiveTab('messages')
            setLocateRequest(current => ({ messageId, sequence: (current?.sequence ?? 0) + 1 }))
          }} />
        </div>
      </main>

      {productivityOpen ? (
        <Suspense fallback={<div className={styles.dialogLoadingOverlay}><div role="status" aria-label="正在加载效率工具">正在加载效率工具…</div></div>}>
          <ProductivityDialog
            draft={draft} getCanvas={prepareCanvas} externalBusy={exporting || mediaImportsBusy}
            onApply={next => {
              void projectWorkspace.checkpointNow('destructive').catch(() => undefined)
              dispatch({ type: 'replace-draft', draft: next })
            }}
            onClose={() => { if (!productivityBusy && !exporting) setProductivityOpen(false) }}
            onBusy={setProductivityBusy}
          />
        </Suspense>
      ) : null}

      {projectOpen ? (
        <Suspense fallback={<div className={styles.dialogLoadingOverlay}><div role="status" aria-label="正在加载本地项目">正在加载本地项目…</div></div>}>
          <ProjectManagerDialog
            draft={draft}
            workspace={projectWorkspace}
            onClose={() => { if (projectWorkspace.status !== 'saving') setProjectOpen(false) }}
          />
        </Suspense>
      ) : null}

      {snapshotQueueOpen ? (
        <Suspense fallback={<div className={styles.dialogLoadingOverlay}><div role="status" aria-label="正在加载截图暂存盘">正在加载截图暂存盘…</div></div>}>
          <SnapshotQueueDialog
            items={stagedSnapshots}
            busy={snapshotQueueBusy}
            onClose={() => { if (!snapshotQueueBusy) setSnapshotQueueOpen(false) }}
            onDownload={downloadSnapshot}
            onDownloadAll={() => void downloadSnapshotZip()}
            onRemove={removeSnapshot}
            onClear={clearSnapshots}
          />
        </Suspense>
      ) : null}

      {qualityIssues !== undefined ? <ExportQualityDialog
        delivery={qualityDelivery}
        issues={qualityIssues}
        busy={exporting}
        onClose={() => { if (!exporting) setQualityIssues(undefined) }}
        onContinue={() => { if (!exporting) void handleExport(qualityDelivery, true) }}
        onSegmentExport={draft.outputMode === 'long' ? () => { if (!exporting) void handleSegmentedExport() } : undefined}
      /> : null}

      {segmentedDraft ? <div className={styles.segmentedExportHost} aria-hidden="true">
        <ChatCanvas ref={segmentedCanvasRef} draft={segmentedDraft} exportMode />
      </div> : null}

      <ConversationDialogs
        draft={draft}
        dispatch={dispatch}
        dialog={dialog}
        setDialog={setDialog}
        replacementId={replacementId}
        setReplacementId={setReplacementId}
        counterpartId={counterpartId}
        setCounterpartId={setCounterpartId}
        onReset={() => {
          void projectWorkspace.checkpointNow('destructive').catch(() => undefined)
          reset()
          setSettingsResetKey(key => key + 1)
          setDialog(null)
        }}
      />

      {libraryOpen ? (
        <ContactLibraryDialog
          participants={draft.participants}
          conversationType={draft.conversationType}
          contacts={library.contacts}
          groups={library.groups}
          loading={library.loading}
          error={library.error}
          onSaveParticipant={saveParticipantToLibrary}
          onRenameContact={renameContact}
          onDeleteContact={(id) => void library.removeContact(id)}
          onApplyContact={applyContactFromLibrary}
          onSaveCurrentGroup={saveCurrentGroup}
          onDeleteGroup={(id) => void library.removeGroup(id)}
          onApplyGroup={requestApplyGroup}
          onClose={() => setLibraryOpen(false)}
        />
      ) : null}

      {saveState === 'error' ? <Toast>自动保存失败，当前内容仍保留在页面中。请先备份项目，暂勿关闭页面。</Toast> : null}
      {saveState !== 'error' && projectWorkspace.status === 'error' ? <Toast>本地项目保存失败，当前内容仍保留在页面中。请导出项目 JSON 备份。</Toast> : null}
      {mediaImportsBusy ? <Toast>媒体处理中，完成后即可继续编辑和导出。</Toast> : null}
      {exportNotice ? <Toast>{exportNotice}</Toast> : null}
    </div>
  )
}
