/**
 * 解析器測試 — 樣本全部取自實際的 订单数据.xlsx
 * 執行：node --experimental-strip-types src/lib/bead-spec.test.ts
 */
import { parseBeadSpec, inferCategory } from './bead-spec.ts'

/** [規格, 期望顆數, 期望信心] —— 判讀不出的一律 1 + manual（ADR-0006 修訂） */
const cases: Array<[string, number, string]> = [
  ['蜜桃粉玛瑙 约4.2mm*3颗', 3, 'parsed'],
  ['紫兔毛款 约8-8.5mm*3颗', 3, 'parsed'],
  ['偏粉冰种 约6-6.8MM 5颗[【新升级A9满分草莓晶】]', 5, 'parsed'],
  ['【御用级-尖货】贝珠款 约4mm*3颗【新升级品质贝珠】', 3, 'parsed'],
  ['【甄选收藏级和田玉】珠径6mm奶白晴款 5颗装', 5, 'parsed'],
  ['【精选天然月光石】蓝月光款 约6mm*5颗', 5, 'parsed'],
  ['8A白水晶 6mm【约60颗左右】】', 60, 'estimated'],
  ['刻面隔片 14k金色5*3mm10颗', 10, 'parsed'],
  ['【3A入门级】天然金曜石散珠约6mm/10颗', 10, 'parsed'],
  ['【10A+优选级】黄塔晶【8mm】散珠【5颗装】', 5, 'parsed'],
  ['4mm/1颗', 1, 'parsed'],
  ['8mm/1颗', 1, 'parsed'],
  ['素银01款 3.5mm/颗(孔径约1.5mm)', 1, 'parsed'],
  ['5A双金眼6mm/4颗', 4, 'parsed'],
  ['大号直径约7.5mm', 1, 'manual'],
  ['24款', 1, 'manual'],
  ['56亮天蓝', 1, 'manual'],
  ['02款', 1, 'manual'],
  ['日本扁丝盒装【白 色】长约45米粗约0.8mm', 1, 'manual'],
]

let pass = 0
let fail = 0
for (const [spec, want, wantConf] of cases) {
  const r = parseBeadSpec(spec)
  const ok = r.beadsPerUnit === want && r.confidence === wantConf
  ok ? pass++ : fail++
  const mark = ok ? '✓' : '✗'
  console.log(
    `${mark} got=${String(r.beadsPerUnit).padStart(4)} want=${String(want).padStart(4)} [${r.confidence.padEnd(9)}/${wantConf.padEnd(9)}] size=${String(r.sizeMm).padStart(5)}  ${spec.slice(0, 34)}`,
  )
}

/* ── 材質分類（ADR-0010）── */

/** [商品名, 規格, 期望分類] —— 樣本全部取自實際的 订单数据.xlsx */
const catCases: Array<[string, string, string]> = [
  ['天然玛瑙散珠手工diy串珠手链官方正品盐源玛瑙散珠圆珠单珠手串', '蜜桃粉玛瑙 约4.2mm*3颗', '玉石'],
  ['和田玉散珠官方正品天然串珠手串旗舰店珠子碧玉diy单珠玉石配件', '珠径6mm奶白晴款 5颗装', '玉石'],
  ['天然灰玛瑙散珠烟紫玉髓圆珠DIY手链手串配件半成品弟子珠隔顶珠', '4mm/1颗', '玉石'],
  ['天然金曜石散珠黑曜石圆珠手工DIY饰品配件男女手串项链水晶珠子', '5A双金眼6mm/4颗', '玉石'],
  ['紫兔毛散珠正品天然紫水晶diy珠子串珠饰品配件单珠手链生日礼物', '紫兔毛款 约8-8.5mm*3颗', '水晶'],
  ['白水晶白色透明散珠半成品珠子DIY串珠佛珠圆珠手链项链饰品', '8A白水晶 6mm', '水晶'],
  ['珍珠散珠串珠子手链正品天然淡水珍珠手链diy配件贝珠小米珠手串', '贝珠款 约4mm*3颗', '水晶'],
  ['天然海蓝宝散珠配件手串DIY手工串珠配饰材料包冰种水晶手链珠子', '海蓝宝【6mm】散珠', '水晶'],
  ['14k包金镀金保色方块切角珠隔珠配珠diy手工串珠饰品配件材料配饰', '刻面隔片 银色5*3mm10颗', '配件'],
  ['古法沙金铜镀金桶珠diy手链手串竹节隔珠手绳金色保色配珠配件', '24款', '配件'],
  ['S925银珠子手链配饰DIY手串文玩设计圆珠批发小银珠散珠银饰配件', '3mm/1颗', '配件'],
  // 商品名同時含「编织绳」與沙金 —— 配件必須先於線材判斷，否則會分錯
  ['古法沙金转运珠散珠小珠子配件雕刻隔珠diy手工编织绳配饰挂件', '06款', '配件'],
  ['进口耐磨手串绳弹力线绳手链穿珠子的皮筋日本串珠线扁丝水晶文玩', '日本扁丝盒装 长约45米', '線材'],
  ['桃花线圈手工编织金店手绳项链纽扣结配件DIY手串菠萝结隔珠配饰', '56亮天蓝', '線材'],
]

console.log('\n── 材質分類 ──')
for (const [title, spec, want] of catCases) {
  const got = inferCategory(title, spec)
  const ok = got === want
  ok ? pass++ : fail++
  console.log(`${ok ? '✓' : '✗'} ${got.padEnd(5)} want=${want.padEnd(5)} ${title.slice(0, 22)}`)
}
console.log(`\n總計 ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
