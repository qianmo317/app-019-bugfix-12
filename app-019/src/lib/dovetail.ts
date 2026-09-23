// 燕尾榫齿宽分配算法（带约束的分配问题，纯函数）
// 设计约定（蓝图 §8）：
//  - 在齿板正面（展示面）划线：边距(半齿) + 齿1 + 槽 + 齿2 + ... + 齿n + 边距
//  - 均衡布局：槽宽 = 齿根宽、边距 = 半个齿根宽 → Σ(齿顶宽) + Σ(齿根宽) = 板宽（严格闭合）
//  - 齿顶宽（展示面）= 齿根宽 + 2 × 斜移量；斜移量 = 齿深 / 角度比 r（1:r）
import type { Wood } from '../types'
import { round01, fmt01 } from './format'

const U = 0.1 // 0.1mm 网格

/** 齿根最小安全宽度（mm，经验值） */
export const MIN_ROOT: Record<Wood, number> = { softwood: 6, hardwood: 4 }

export interface DovetailInput {
  width: number     // 齿板宽度 W (mm)
  thickness: number // 齿板厚度 t (mm)
  ratio: 6 | 7 | 8  // 角度比 1:r
  teeth?: number    // 齿数（缺省自动建议）
  kerf: number      // 锯路宽度 (mm)
  wood: Wood
  blind?: boolean          // 半隐燕尾
  blindDepthRatio?: number // 半隐深度比例，默认 0.75
}

export interface ToothCell {
  index: number  // 齿号 1..n
  topW: number   // 齿顶宽（展示面）
  rootW: number  // 齿根宽（背面）
  faceX: number  // 展示面左边缘 x 坐标
  backX: number  // 背面左边缘 x 坐标
}

export interface PinCell {
  index: number
  faceX: number
  faceW: number
  backX: number
  backW: number
  half: boolean // 边缘半齿
}

export interface DovetailResult {
  teeth: ToothCell[]
  pins: PinCell[]
  margin: number      // 首尾半齿边距（左右对称）
  slopeOffset: number // 单边斜移量 = 齿深 / r
  depth: number       // 齿深（穿透=板厚，半隐=0.75×板厚）
  pitch: number       // 齿距 ≈ W/n
  warnings: string[]
  closureError: number // |Σ齿顶 + Σ齿根 − 板宽|
  minRootW: number
  minTopW: number
}

/** 齿数合理范围（蓝图 §8：2~12） */
export const MIN_TEETH = 2
export const MAX_TEETH = 12
/** 齿距下限（mm，知识卡经验：15~30mm 较稳） */
export const MIN_PITCH = 15

/** 齿数自动建议：目标齿距约 28mm，并保证齿根宽不低于最小安全值 */
export function suggestTeeth(
  width: number,
  thickness: number,
  ratio: 6 | 7 | 8,
  wood: Wood,
  blind = false,
): number {
  const depth = blind ? thickness * 0.75 : thickness
  const off = depth / ratio
  let n = Math.max(MIN_TEETH, Math.min(MAX_TEETH, Math.round(width / 28)))
  while (n > MIN_TEETH && width / (2 * n) - off < MIN_ROOT[wood]) n--
  return n
}

export function computeDovetail(input: DovetailInput): DovetailResult {
  const { width, thickness, ratio, kerf, wood, blind } = input
  const warnings: string[] = []
  const depth = blind ? round01(thickness * (input.blindDepthRatio ?? 0.75)) : thickness
  const slopeOffset = depth / ratio
  const minRootW = MIN_ROOT[wood]
  const minTopW = round01(2 * kerf)

  // —— 齿数输入校验：非法值（非整数 / 超出 2~12）必须警告，不能悄悄钳制 ——
  // rawN 仅用于计数类校验与齿距展示；几何排布用钳制后的安全 n，保证图纸仍可渲染。
  const rawN = input.teeth ?? suggestTeeth(width, thickness, ratio, wood, blind)
  const teethInvalid =
    !Number.isFinite(rawN) || !Number.isInteger(rawN) || rawN < MIN_TEETH || rawN > MAX_TEETH
  const n = Number.isFinite(rawN)
    ? Math.max(MIN_TEETH, Math.min(MAX_TEETH, Math.round(rawN)))
    : MIN_TEETH
  if (!Number.isFinite(rawN) || !Number.isInteger(rawN)) {
    warnings.push(`齿数 ${String(input.teeth)} 不是有效整数，请填写 ${MIN_TEETH}~${MAX_TEETH} 之间的整数（或填 0 用自动建议）`)
  } else if (rawN < MIN_TEETH) {
    warnings.push(`齿数 ${rawN} 超出合理范围（${MIN_TEETH}~${MAX_TEETH} 齿）：齿数不能少于 ${MIN_TEETH}，请增大齿数或改用自动建议`)
  } else if (rawN > MAX_TEETH) {
    warnings.push(`齿数 ${rawN} 超出合理范围（${MIN_TEETH}~${MAX_TEETH} 齿）：当前板宽最多排 ${MAX_TEETH} 齿，请减少齿数（自动建议 ${suggestTeeth(width, thickness, ratio, wood, blind)} 齿）`)
  }

  // —— 0.1mm 网格上的等分 + 余量处理 ——
  // 总网格数分配到 n 个齿（齿顶+齿根 成对），累积取整差分保证 Σpair 严格等于总宽
  const totalUnits = Math.round(width / U)
  const per = totalUnits / n
  // 累积取整差分：Σpair 严格等于 totalUnits，逐齿偏差 ≤ 1 格（0.1mm）
  const pairs: number[] = []
  for (let i = 0; i < n; i++) {
    pairs.push(Math.round(per * (i + 1)) - Math.round(per * i))
  }
  // 每对内分齿顶/齿根：齿顶−齿根 = 2×斜移量（0.1 网格取整，逐齿误差 ≤0.1mm）
  const d = Math.round((2 * slopeOffset) / U)
  const topUnits: number[] = pairs.map((p) => Math.round((p + d) / 2))
  const rootUnits: number[] = pairs.map((p, i) => p - topUnits[i])

  // 边距（半齿）= 末齿齿根宽一半，左右严格对称；槽宽 = 对应齿的齿根宽
  const margin = (rootUnits[n - 1] / 2) * U
  const teeth: ToothCell[] = []
  let x = margin
  for (let i = 0; i < n; i++) {
    const topW = topUnits[i] * U
    const rootW = rootUnits[i] * U
    teeth.push({ index: i + 1, topW, rootW, faceX: x, backX: x + slopeOffset })
    x += topW
    if (i < n - 1) x += rootW // 齿间槽
  }
  const closureError = Math.abs(x + margin - width)

  // —— 销板（B 板）互补齿形 ——
  const pins: PinCell[] = []
  pins.push({
    index: 0,
    faceX: 0,
    faceW: margin,
    backX: 0,
    backW: margin + slopeOffset,
    half: true,
  })
  for (let i = 0; i < n - 1; i++) {
    const left = teeth[i].faceX + teeth[i].topW
    pins.push({
      index: i + 1,
      faceX: left,
      faceW: teeth[i + 1].faceX - left,
      backX: left - slopeOffset,
      backW: teeth[i + 1].faceX - left + 2 * slopeOffset,
      half: false,
    })
  }
  const last = teeth[n - 1]
  pins.push({
    index: n,
    faceX: last.faceX + last.topW,
    faceW: margin,
    backX: last.faceX + last.topW - slopeOffset,
    backW: margin + slopeOffset,
    half: true,
  })

  // —— 约束校验与警告（蓝图 §8：不允许静默输出，须写明项目/当前值/调整方法）——
  const woodLabel = wood === 'softwood' ? '软木' : '硬木'
  const suggested = suggestTeeth(width, thickness, ratio, wood, blind)
  const minRoot = Math.min(...rootUnits) * U
  const minTop = Math.min(...topUnits) * U

  // 1) 几何排布失效（齿根/齿顶为负）：此排布无法下锯
  if (minRoot < 0 || minTop < 0) {
    warnings.push(
      `当前 ${n} 齿在 1:${ratio} 斜度下无法排布（最小齿根宽 ${fmt01(minRoot)}mm、最小齿顶宽 ${fmt01(minTop)}mm），齿已重叠为负值，请减少齿数至 ${Math.min(n, suggested)} 齿左右，或减小板厚/放缓斜度`,
    )
  }

  // 2) 齿根宽低于材料最小安全值（软木 6mm / 硬木 4mm）：齿根太脆易断
  if (minRoot >= 0 && minRoot + 1e-9 < minRootW) {
    warnings.push(
      `齿根宽过小：最小仅 ${fmt01(minRoot)}mm，低于${woodLabel}最小安全值 ${minRootW}mm，齿根易断裂，建议减少齿数（当前 ${n} 齿 → 建议 ${suggested} 齿）或加大板宽`,
    )
  }

  // 3) 齿顶宽窄于两侧锯路（2×kerf）：锯片两侧各让 kerf/2 后没有实体，切不出齿
  if (minTop >= 0 && minTop + 1e-9 < minTopW) {
    warnings.push(
      `齿顶宽过小：最小仅 ${fmt01(minTop)}mm，窄于锯路的两倍 2×${fmt01(kerf)}=${fmt01(minTopW)}mm，锯片两次让刀后无实体、切不出来，建议减少齿数（当前 ${n} 齿 → 建议 ${suggested} 齿）、减小锯路或加大板宽`,
    )
  }

  // 4) 齿数过少：大板宽下结合强度不足（齿数非法时已由范围警告覆盖，不重复报）
  if (!teethInvalid && rawN < 3 && width >= 150) {
    warnings.push(
      `齿数过少：仅 ${rawN} 齿，板宽 ${fmt01(width)}mm 建议至少 3 齿以保证结合强度，请增加齿数（建议 ${suggested} 齿）`,
    )
  }

  // 5) 齿距过小（按用户输入齿数计算）：过密易劈裂
  const inputPitch = width / rawN
  if (!teethInvalid && inputPitch > 0 && inputPitch < MIN_PITCH) {
    warnings.push(
      `齿距过小：仅 ${fmt01(inputPitch)}mm（< ${MIN_PITCH}mm），齿过密端部易劈裂，建议减少齿数至 ${suggested} 齿左右（对应齿距约 ${fmt01(width / suggested)}mm）`,
    )
  }
  // 图纸标注的齿距按实际排布齿数，保证标注与画出的齿一致（非法齿数已另行警告）
  const pitch = width / n

  return {
    teeth,
    pins,
    margin,
    slopeOffset,
    depth,
    pitch,
    warnings,
    closureError,
    minRootW,
    minTopW,
  }
}
