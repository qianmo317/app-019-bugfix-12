// 新建方案：选榫卯类型 → 填参数 → 生成默认方案进入编辑器
import { useMemo, useState } from 'react'
import type { Joint, JointKind, Params } from '../types'
import { makePlan, upsertPlan } from '../store/plans'
import { navigate } from '../router'
import { KindPicker, ParamForm } from '../components/ParamForm'
import { computeJoint } from '../lib/calc'
import { buildViews } from '../geometry/views'
import { ViewSvg } from '../components/ViewSvg'

const DEFAULT_PARAMS: Params = {
  boardA: { thickness: 18, width: 200 },
  boardB: { thickness: 18, width: 200 },
  wood: 'hardwood',
  fit: 'standard',
  dovetail: { angleRatio: 8 },
  kerfMm: 1.1,
}

export function NewPlanPage() {
  const [kind, setKind] = useState<JointKind | null>(null)
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS)

  // 参数即填即算：警告与图纸预览在点「生成图纸」之前就必须可见（不允许静默放行）
  const preview = useMemo(() => {
    if (!kind) return null
    const joint: Joint = { kind, params, notes: [] }
    const result = computeJoint(joint)
    return { result, views: buildViews(joint, result) }
  }, [kind, params])

  const create = () => {
    if (!kind) return
    const plan = makePlan(kind, params)
    upsertPlan(plan)
    navigate(`/plan/${plan.id}`)
  }

  return (
    <div className="page" data-testid="new-page">
      <h1>新建方案</h1>
      <h2>1. 选择榫卯类型</h2>
      <KindPicker value={kind} onChange={setKind} />
      <h2>2. 填写参数</h2>
      {kind ? (
        <ParamForm kind={kind} params={params} onChange={setParams} warnings={preview?.result.warnings ?? []} />
      ) : (
        <p className="empty">先选择上面的榫卯类型</p>
      )}
      {preview && preview.result.warnings.length > 0 && (
        <div className="warnings" role="alert" data-testid="warnings">
          {preview.result.warnings.map((w, i) => (
            <p key={i}>⚠ {w}</p>
          ))}
        </div>
      )}
      {preview && (
        <div className="views" data-testid="preview-views">
          {preview.views.map((vm) => <ViewSvg key={vm.id} vm={vm} />)}
        </div>
      )}
      <div className="actions">
        <button className="btn btn-primary" data-testid="create-plan" disabled={!kind} onClick={create}>
          生成图纸
        </button>
      </div>
    </div>
  )
}
