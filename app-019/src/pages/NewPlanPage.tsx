// 新建方案：选榫卯类型 → 填参数 → 生成默认方案进入编辑器
import { useMemo, useState } from 'react'
import type { JointKind, Params } from '../types'
import { makePlan, upsertPlan } from '../store/plans'
import { navigate } from '../router'
import { KindPicker, ParamForm } from '../components/ParamForm'
import { WarningBanner } from '../components/WarningBanner'
import { computeJoint } from '../lib/calc'

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

  // 参数填写阶段即时校验：违规参数在生成图纸前就提示，不把问题带进车间
  const warnings = useMemo(
    () => (kind ? computeJoint({ kind, params, notes: [] }).warnings : []),
    [kind, params],
  )

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
        <>
          <ParamForm kind={kind} params={params} onChange={setParams} />
          <WarningBanner warnings={warnings} testid="new-warnings" />
        </>
      ) : (
        <p className="empty">先选择上面的榫卯类型</p>
      )}
      <div className="actions">
        <button className="btn btn-primary" data-testid="create-plan" disabled={!kind} onClick={create}>
          生成图纸
        </button>
      </div>
    </div>
  )
}
