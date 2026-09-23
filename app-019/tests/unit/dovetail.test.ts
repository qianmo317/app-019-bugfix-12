// 燕尾齿宽分配算法单测（蓝图 §10 验收：随机 200 组闭合 ≤0.1mm + 警告不静默）
import { describe, it, expect } from 'vitest'
import { computeDovetail, suggestTeeth, MIN_ROOT } from '../../src/lib/dovetail'

/** 可复现的伪随机（LCG） */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('燕尾齿宽分配（蓝图 §8 约束）', () => {
  it('基本几何：Σ(齿顶宽)+Σ(齿根宽)=板宽，边距=半齿根宽', () => {
    const r = computeDovetail({ width: 200, thickness: 18, ratio: 8, kerf: 1.1, wood: 'hardwood' })
    const sumTop = r.teeth.reduce((s, t) => s + t.topW, 0)
    const sumRoot = r.teeth.reduce((s, t) => s + t.rootW, 0)
    expect(sumTop + sumRoot).toBeCloseTo(200, 6)
    // 边距 = 末齿齿根宽一半
    expect(r.margin).toBeCloseTo(r.teeth[r.teeth.length - 1].rootW / 2, 6)
    // 齿顶 = 齿根 + 2×斜移量（0.1mm 网格取整，逐齿误差 ≤0.1mm，闭合不受影响）
    for (const t of r.teeth) {
      expect(Math.abs(t.topW - t.rootW - 2 * r.slopeOffset)).toBeLessThanOrEqual(0.1 + 1e-9)
    }
  })

  it('随机 200 组：严格闭合 ≤0.1mm，低于最小值必须给出警告（不静默）', () => {
    const rand = mulberry32(20260916)
    let belowMinCount = 0
    for (let i = 0; i < 200; i++) {
      const width = Math.round((50 + rand() * 550) * 2) / 2 // 50~600，0.5 步进
      const teeth = 2 + Math.floor(rand() * 11) // 2~12
      const ratios = [6, 7, 8] as const
      const ratio = ratios[Math.floor(rand() * 3)]
      const wood = rand() < 0.5 ? 'softwood' : 'hardwood'
      const thickness = Math.round((12 + rand() * 24) * 2) / 2 // 12~36
      const kerf = [0.8, 1.1, 1.6, 2.2][Math.floor(rand() * 4)]
      const r = computeDovetail({ width, thickness, ratio, teeth, kerf, wood })

      // 1) 闭合 ≤ 0.1mm
      expect(r.closureError).toBeLessThanOrEqual(0.1)
      // 2) 无 NaN/负坐标失控
      for (const t of r.teeth) {
        expect(Number.isFinite(t.topW)).toBe(true)
        expect(Number.isFinite(t.rootW)).toBe(true)
        expect(Number.isFinite(t.faceX)).toBe(true)
      }
      // 3) 首齿从边距开始，末齿 + 边距 = 板宽
      expect(r.teeth[0].faceX).toBeCloseTo(r.margin, 6)
      const last = r.teeth[r.teeth.length - 1]
      expect(last.faceX + last.topW + r.margin).toBeCloseTo(width, 6)
      // 4) 低于最小安全值 / 锯路限制 → 必须有警告
      const minRoot = Math.min(...r.teeth.map((t) => t.rootW))
      const minTop = Math.min(...r.teeth.map((t) => t.topW))
      const mustWarn =
        minRoot < MIN_ROOT[wood] ||
        (minTop < 2 * kerf && minTop >= 0) ||
        (teeth < 3 && width >= 150) ||
        width / teeth < 20 ||
        teeth < 2 || teeth > 12
      if (minRoot < MIN_ROOT[wood]) belowMinCount++
      if (mustWarn) {
        expect(r.warnings.length).toBeGreaterThan(0)
      } else {
        expect(r.warnings).toEqual([])
      }
    }
    // 覆盖面自检：随机样本确实触及了“低于最小值”分支
    expect(belowMinCount).toBeGreaterThan(0)
  })

  it('边界：齿根宽刚好等于最小值（软木 6mm）时无警告', () => {
    // 构造：t=18, r=6 → 单边斜移 3mm，齿顶-齿根=6mm；要齿根=6 → 齿顶=12 → 每齿 18mm
    // n=5 → W=90；此时齿距 18mm 会按现行阈值（<20mm）单独给齿距警告，但不得有齿根类警告
    const r = computeDovetail({ width: 90, thickness: 18, ratio: 6, teeth: 5, kerf: 1.1, wood: 'softwood' })
    for (const t of r.teeth) {
      expect(t.rootW).toBeCloseTo(6, 6)
      expect(t.topW).toBeCloseTo(12, 6)
    }
    expect(r.warnings.some((w) => w.includes('齿根'))).toBe(false)

    // 齿距也不越界时（20mm 整），警告应为空：t=15, r=6 → 齿顶-齿根=5，每齿 20 → 齿根 7.5 ≥ 6
    const ok = computeDovetail({ width: 100, thickness: 15, ratio: 6, teeth: 5, kerf: 1.1, wood: 'softwood' })
    expect(Math.min(...ok.teeth.map((t) => t.rootW))).toBeGreaterThanOrEqual(MIN_ROOT.softwood - 1e-9)
    expect(ok.warnings).toEqual([])
  })

  it('齿顶宽 < 锯路×2 时给警告（否则切不出来）', () => {
    const r = computeDovetail({ width: 30, thickness: 18, ratio: 6, teeth: 12, kerf: 2.2, wood: 'hardwood' })
    const minTop = Math.min(...r.teeth.map((t) => t.topW))
    if (minTop < 4.4) {
      expect(r.warnings.some((w) => w.includes('锯路'))).toBe(true)
    }
  })

  it('齿数过多导致齿根为负：必须警告而非静默', () => {
    const r = computeDovetail({ width: 60, thickness: 18, ratio: 6, teeth: 12, kerf: 1.1, wood: 'softwood' })
    expect(Math.min(...r.teeth.map((t) => t.rootW))).toBeLessThan(0)
    expect(r.warnings.some((w) => w.includes('无法排布'))).toBe(true)
  })

  it('齿数过少（W≥150 且 n<3）给出强度警告', () => {
    const r = computeDovetail({ width: 300, thickness: 18, ratio: 8, teeth: 2, kerf: 1.1, wood: 'hardwood' })
    expect(r.warnings.some((w) => w.includes('齿数过少'))).toBe(true)
  })

  it('场景回归：板宽 300 / 2 齿 —— 警告须写明项目、当前值与调整方向', () => {
    const r = computeDovetail({ width: 300, thickness: 18, ratio: 8, teeth: 2, kerf: 1.1, wood: 'hardwood' })
    const w = r.warnings.find((x) => x.includes('齿数过少'))!
    expect(w).toContain('2 齿')
    expect(w).toContain('300')
    expect(w).toContain('至少 3 齿')
  })

  it('场景回归：锯路 2.2 + 齿顶 4.3mm —— 必须有锯路警告，写明 2×锯路与当前齿顶', () => {
    const r = computeDovetail({ width: 30, thickness: 18, ratio: 6, teeth: 12, kerf: 2.2, wood: 'hardwood' })
    const w = r.warnings.find((x) => x.includes('锯路'))!
    expect(w).toContain('4.3')
    expect(w).toContain('4.4')
    expect(w).toContain('2.2')
  })

  it('场景回归：齿距落在十几毫米（16.7mm）必须警告', () => {
    const r = computeDovetail({ width: 200, thickness: 18, ratio: 8, teeth: 12, kerf: 1.1, wood: 'hardwood' })
    expect(r.pitch).toBeCloseTo(16.7, 1)
    const w = r.warnings.find((x) => x.includes('齿距过小'))!
    expect(w).toContain('16.7')
    expect(w).toContain('20')
  })

  it('齿距 20mm 整不警告，19.9mm 警告（阈值边界）', () => {
    const ok = computeDovetail({ width: 240, thickness: 18, ratio: 8, teeth: 12, kerf: 1.1, wood: 'hardwood' })
    expect(ok.pitch).toBeCloseTo(20, 6)
    expect(ok.warnings.some((w) => w.includes('齿距过小'))).toBe(false)
    const bad = computeDovetail({ width: 239, thickness: 18, ratio: 8, teeth: 12, kerf: 1.1, wood: 'hardwood' })
    expect(bad.pitch).toBeLessThan(20)
    expect(bad.warnings.some((w) => w.includes('齿距过小'))).toBe(true)
  })

  it('场景回归：齿数填出范围（20 / 0 / 负数）—— 不静默钳制，警告写出填写值与允许范围', () => {
    for (const bad of [20, 0, -3]) {
      const r = computeDovetail({ width: 200, thickness: 18, ratio: 8, teeth: bad, kerf: 1.1, wood: 'hardwood' })
      const w = r.warnings.find((x) => x.includes('超出合理范围'))!
      expect(w).toContain(String(bad))
      expect(w).toContain('2~12')
    }
    // 几何不允许因越界输入失控：所有坐标仍是有限数
    const r = computeDovetail({ width: 200, thickness: 18, ratio: 8, teeth: -3, kerf: 1.1, wood: 'hardwood' })
    for (const t of r.teeth) {
      for (const v of [t.topW, t.rootW, t.faceX, t.backX]) expect(Number.isFinite(v)).toBe(true)
    }
  })

  it('半隐燕尾：齿深 = 0.75×板厚，斜移量按齿深计算', () => {
    const r = computeDovetail({ width: 200, thickness: 18, ratio: 8, kerf: 1.1, wood: 'hardwood', blind: true })
    expect(r.depth).toBeCloseTo(13.5, 6)
    expect(r.slopeOffset).toBeCloseTo(13.5 / 8, 6)
  })

  it('suggestTeeth：保证齿根 ≥ 最小安全值，范围 2~12', () => {
    expect(suggestTeeth(200, 18, 8, 'hardwood')).toBe(7)
    // 窄板：自动降到齿根可行的最少齿数
    const n = suggestTeeth(45, 18, 6, 'softwood')
    expect(n).toBeGreaterThanOrEqual(2)
    const r = computeDovetail({ width: 45, thickness: 18, ratio: 6, teeth: n, kerf: 1.1, wood: 'softwood' })
    expect(Math.min(...r.teeth.map((t) => t.rootW))).toBeGreaterThanOrEqual(MIN_ROOT.softwood - 1e-9)
  })
})
