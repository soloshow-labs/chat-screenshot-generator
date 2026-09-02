import type { QualityIssue } from '../../services/exportQuality'
export function QualityPanel({ issues, onCheck, onExport, exportLabel = '继续导出' }: { issues: QualityIssue[] | null; onCheck: () => void; onExport?: () => void; exportLabel?: '继续复制' | '继续导出' }) {
  return <>
    <button type="button" onClick={onCheck}>运行质量检查</button>
    {issues ? issues.length ? <ul>{issues.map((issue, index) => <li key={`${issue.code}-${index}`} data-quality-code={issue.code}><strong>{issue.severity === 'error' ? '错误' : '警告'}：</strong>{issue.message}</li>)}</ul> : <p>检查通过，没有发现问题。</p> : <p>检查截图范围、媒体素材、输出尺寸和实际画布。</p>}
    {onExport && issues && !issues.some(issue => issue.severity === 'error') ? <button type="button" onClick={onExport}>{exportLabel}</button> : null}
  </>
}
