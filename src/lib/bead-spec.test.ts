/**
 * 解析器測試 — 樣本全部取自實際的 订单数据.xlsx
 * 執行：node --experimental-strip-types src/lib/bead-spec.test.ts
 */
import { parseBeadSpec } from './bead-spec.ts'

const cases: Array<[string, number | null]> = [
  ['蜜桃粉玛瑙 约4.2mm*3颗', 3],
  ['紫兔毛款 约8-8.5mm*3颗', 3],
  ['偏粉冰种 约6-6.8MM 5颗[【新升级A9满分草莓晶】]', 5],
  ['【御用级-尖货】贝珠款 约4mm*3颗【新升级品质贝珠】', 3],
  ['【甄选收藏级和田玉】珠径6mm奶白晴款 5颗装', 5],
  ['【精选天然月光石】蓝月光款 约6mm*5颗', 5],
  ['8A白水晶 6mm【约60颗左右】】', 60],
  ['刻面隔片 14k金色5*3mm10颗', 10],
  ['【3A入门级】天然金曜石散珠约6mm/10颗', 10],
  ['【10A+优选级】黄塔晶【8mm】散珠【5颗装】', 5],
  ['4mm/1颗', 1],
  ['8mm/1颗', 1],
  ['素银01款 3.5mm/颗(孔径约1.5mm)', 1],
  ['5A双金眼6mm/4颗', 4],
  ['大号直径约7.5mm', null],
  ['24款', null],
  ['56亮天蓝', null],
  ['02款', null],
  ['日本扁丝盒装【白 色】长约45米粗约0.8mm', null],
]

let pass = 0
let fail = 0
for (const [spec, want] of cases) {
  const r = parseBeadSpec(spec)
  const ok = r.beadsPerUnit === want
  ok ? pass++ : fail++
  const mark = ok ? '✓' : '✗'
  console.log(
    `${mark} got=${String(r.beadsPerUnit).padStart(4)} want=${String(want).padStart(4)} [${r.confidence.padEnd(9)}] size=${String(r.sizeMm).padStart(5)}  ${spec.slice(0, 34)}`,
  )
}
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
