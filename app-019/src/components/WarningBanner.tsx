// 约束警告条：编辑器 / 新建页 / 打印图纸共用，确保违规参数不被静默放行（蓝图 §8）
export function WarningBanner({ warnings, testid = 'warnings' }: { warnings: string[]; testid?: string }) {
  if (warnings.length === 0) return null
  return (
    <div className="warnings" role="alert" data-testid={testid}>
      <p className="warnings-head">⚠ 参数不合格，按当前图纸直接下锯会切出废件，请先调整后再施工：</p>
      {warnings.map((w, i) => (
        <p key={i}>• {w}</p>
      ))}
    </div>
  )
}
