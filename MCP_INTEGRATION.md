# MCP 集成说明 · 麦麦营养搭配咪

本文说明本 Skill 实际使用了哪些麦当劳 MCP 能力、如何调用、如何把返回值映射成推荐算法需要的结构，
以及健康评分的完整公式与离线降级策略。

---

## 1. MCP Server

| 项 | 值 |
|---|---|
| Server 名称 | `mcd-mcp`（麦当劳中国官方 MCP Server） |
| 地址 | `https://mcp.mcd.cn` |
| 传输协议 | `streamablehttp` |
| 鉴权 | `Authorization: Bearer <MCP_TOKEN>`（[open.mcd.cn/mcp](https://open.mcd.cn/mcp) 申请） |
| 业务场景 | 到店自取（`beType=1`、`orderType=1`） |
| 本仓库快照 | 门店 `1450713` 麦当劳上海黄浦华旭国际大厦餐厅，抓取于 `2026-10-22 22:25` |

> 只读使用菜单、门店与营养查询能力，**不涉及下单、支付、优惠券核销**，不产生任何真实交易。

---

## 2. 实际使用的 Tool

| # | Tool | 关键入参 | 取什么 | 在本作品中的作用 |
|---|---|---|---|---|
| 1 | `query-nearby-stores` | `beType=1`, `searchType=2`, `city`, `keyword` | `storeCode`、`storeName`、`address` | 定位门店，拿到后续所有查询必需的 `storeCode` |
| 2 | `query-meals` | `storeCode`, `orderType=1`, `beType=1` | `meals[].code`、`meals[].name`、`currentPrice` | **商品编码 + 真实价格**（接口单位为「分」，已 ÷100） |
| 3 | `list-nutrition-foods` | 无参数 | `energyKcal`、`protein`、`fat`、`carbohydrate`、`sodium`、`calcium` | **营养六项**（全量约 130 条，按餐品名匹配） |
| 4 | `query-meal-detail`（可选） | `storeCode`, `orderType`, `beType`, `code` | 套餐组成、`modification` 特调项 | 需要解释「套餐里到底有什么」或建议「不加酱」时补充 |

**未使用**：`create-order`、`calculate-price`、`query-my-coupons`、`mall-*`、`party-*` 等交易与营销类工具。
不调用 `calculate-price` 的原因：它需要完整下单上下文（餐具费、随单购、券），而本作品的预算约束用的是
`query-meals` 返回的**商品现价之和**，足以做套餐总价约束，且不会误触发下单链路。

### 为什么必须做「两次查询 + 名称匹配」

`query-meals` 返回 `productCode` 与价格但**没有营养**；`list-nutrition-foods` 返回营养但**没有 productCode**。
两者只能按餐品名对齐。这是本集成最关键的一处工程处理，也是数据质量的主要风险点，处理方式见 §4。

---

## 3. 调用链路

```
用户：想吃得健康点，预算 40，乳制品过敏
        │
        ▼
[1] query-nearby-stores(beType=1, searchType=2, city="上海", keyword="人民广场")
        └→ storeCode = 1450713
        │
        ▼
[2] query-meals(storeCode=1450713, orderType=1, beType=1)
        └→ 约 100 条在售记录，含套餐/周边/蘸酱
        │
        ▼
[3] list-nutrition-foods()
        └→ 约 130 条营养记录（无 code、无价格）
        │
        ▼
[4] 清洗与对齐（见 §4）→ 32 条可用单品（主餐 10 / 配餐 8 / 饮料 14）
        │
        ▼
[5] 写 data/mcp_snapshot.json → python tools/build_data.py → 前端 .js 镜像
        │
        ▼
[6] 前端：硬过滤 → 组合 → 评分 → 排序 → 轮换 → 渲染 3 张卡片
```

### 真实返回片段（截取）

`query-meals`：

```json
{
  "meals": {
    "1100": { "name": "巨无霸", "currentPrice": "25.5", "originalPrice": "25.5" },
    "1406": { "name": "板烧鸡腿堡", "currentPrice": "23.5" },
    "6102": { "name": "苹果片", "currentPrice": "7" }
  },
  "categories": [{ "name": "巨无霸\n牛鱼肉堡", "meals": [{ "code": "1100", "tags": ["单品", "100%纯牛肉"] }] }]
}
```

`list-nutrition-foods`（原始格式为紧凑文本表）：

```
{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}
  巨无霸,null,2146,513,27,26,42,961,171
  板烧鸡腿堡,null,1638,391,23,17,35,1041,93
  苹果片,null,133,32,0,0,7,0,18
```

---

## 4. 字段映射

| 内部字段 | 来源 | 映射规则 |
|---|---|---|
| `code` | `query-meals.meals.{code}` | 字符串原样保留（后续若接通下单可直接复用） |
| `name` | `meals.{code}.name` | 原样；同名多规格时在名称后标注规格（如「可乐(中)」） |
| `priceYuan` | `currentPrice` | `Number(price) `（若接口给的是分，则 ÷100），保留 2 位小数 |
| `category` | 规则推导 | 汉堡/卷/堡 → `main`；薯条/小食/玉米杯/苹果片/冰淇淋 → `side`；饮品/咖啡/牛奶 → `drink` |
| `nutrition.energyKcal` | `energyKcal` | 直取（另有 `energyKj` 可交叉校验） |
| `nutrition.proteinG / fatG / carbG / sodiumMg` | `protein / fat / carbohydrate / sodium` | 直取 |
| `nutrition.sugarG` | **无直接字段** | 按碳水折算（饮料近似等于碳水），并置 `sugarEstimated=true` |
| `allergens[]` | **无官方字段** | `data/allergen_map.json` 关键词保守映射 + 人工标注 |
| `dietTags[]` | **无官方字段** | 同上（牛肉/猪肉/鸡肉/油炸/辛辣/咖啡因/甜品/含糖） |
| `tags[]` | `meals.{code}.tags` | 原样保留，用于「人气」「套餐」等展示 |

**清洗规则（宁可少，不可错）**

1. 剔除周边商品（丝巾、棒球帽、贴纸、按摩捶等）、蘸酱、套餐（`套餐`/`件套`/`随心选`）——套餐无法拆出单品营养，不参与组合；
2. 剔除名称无法与营养表匹配的单品，并在 `joinNotes` 中记录；
3. 同名多规格（可乐/薯条/牛奶）统一取「中杯/中份」，名称加规格后缀；
4. 营养字段缺失或为负值的记录直接丢弃，不猜测。

> 依据：`list-nutrition-foods` 的品类口径是「常见餐品」，与门店在售 SKU 并非一一对应。
> 强行给每个 SKU 编造营养值会违反「不得伪造官方实时营养数据」的要求，因此本作品选择
> **只推荐能确证营养的商品**，并在 README「已知边界」中明示。

---

## 5. 数据源模式判定与降级

```
读取 window.MCD_SNAPSHOT
  ├─ 不存在 / items 为空            → 演示模式（原因：未配置 Token 或未抓取）
  ├─ capturedAt 超过 168 小时       → 演示模式（原因：快照过期）
  └─ 存在且在有效期内               → 实时 MCP 模式

读取 window.MCD_FALLBACK
  ├─ 存在且 items 非空              → 演示模式（徽章黄色 + 页脚注明非实时）
  └─ 两者都不可用                   → 错误态，提示重新生成数据
```

| 触发条件 | 前端表现 |
|---|---|
| 未配置 Token / 未启用连接器 | 徽章「演示模式」，`modeNote` 说明「未检测到 MCP 快照」 |
| MCP 请求失败 / 超时（抓取阶段） | 保留上一份快照；若快照已过期则降级为演示数据 |
| 返回空数据 / 结构损坏 | `build_data.py` 校验失败 → 不写入，前端继续用演示数据 |
| 快照过期（>168 h） | 自动降级，`resultMeta` 与页脚同时提示 |

**实时数据永远优先**：只有快照不可用时才读 fallback，两者不会混用；UI 徽章保证用户随时知道自己在看什么数据。

---

## 6. 推荐算法

### 6.1 流程

```
候选商品池（32 条）
   → ① 过敏原 + 明确忌口硬过滤（命中即出局）
   → ② 按品类拆池（main / side / drink），任一类为空则终止并提示
   → ③ 主餐 × 配餐 × 饮料 穷举（默认 10×8×14 = 1120 种）
   → ④ 套餐总价 ≤ 预算上限 且 ≥ 0（饮料计入）
   → ⑤ 健康评分（六维加权，0–100）
   → ⑥ 排序（分数降序，同分取低价）
   → ⑦ 轮换（排除最近 9 个已展示组合，优先不同主餐），取前 3
```

### 6.2 健康评分公式

总分 `Score = 100 × Σ (wᵢ × sᵢ)`，权重定义在 `js/score.js` 的 `WEIGHTS` 常量中：

| 维度 | 权重 | 子分数 sᵢ 定义 | 设计理由 |
|---|---|---|---|
| 热量契合 `kcal` | **0.28** | 目标区间 `[lo, hi]`，中心 `c`，半宽 `h`；`s = clamp01(1 − max(0, |E−c|−h) / (1.2h))` | 减脂场景第一约束是总热量，区间内满分，越界线性衰减 |
| 蛋白质 `protein` | **0.22** | `s = 0.75 × clamp01(P/30) + 0.25 × clamp01((P/E)/0.075)` | 既看绝对量（30 g 为单餐参考），也看蛋白密度（0.075 g/kcal） |
| 脂肪 `fat` | **0.16** | `s = clamp01(1 − max(0, fatEnergyPct − 0.30) / 0.22)`，`fatEnergyPct = 9F/E` | 用供能比而非克数，避免被总热量放大或掩盖 |
| 钠 `sodium` | **0.18** | `s = clamp01(1 − max(0, Na − 600) / 1400)` | 单餐 600 mg 以内满分，2000 mg 归零；钠是麦当劳套餐最容易被忽略的问题 |
| 糖 `sugar` | **0.12** | `s = clamp01(1 − S/45)` | 0 g 满分，45 g（接近每日添加糖上限）归零 |
| 结构 `structure` | **0.04** | 基础 0.5；配餐含蔬果 +0.25；饮料零糖 +0.25；甜品配餐 −0.30 | 奖励「有菜有饮水」的合理结构，不喧宾夺主 |

**目标热量区间**（`BANDS`）：

| 目标 | 区间 (kcal) |
|---|---|
| 减脂 `fat_loss` | 420–600 |
| 高蛋白 `high_protein` | 500–750 |
| 低钠 `low_sodium` | 450–700 |
| 均衡 `balanced` | 500–750 |

多选时取区间**交集**（如减脂 + 高蛋白 → 500–600）；交集为空时退化为各目标中点均值 ±110 kcal。

**参考值**（`REF`，用于卡片上的百分比，均在 UI 标注为估算）：

| 项 | 参考值 | 口径 |
|---|---|---|
| 能量 | 2000 kcal | 轻体力活动成年人 |
| 蛋白质 | 60 g | 同上 |
| 脂肪 | 60 g | 同上（约 27% 供能） |
| 碳水 | 300 g | 同上 |
| 钠 | 2000 mg | 每日控制上限参考 |
| 添加糖 | 50 g | 每日上限参考 |

**慢跑等效**：`分钟 = 热量 ÷ 8`，按约 60 kg 体重、8 km/h 配速（≈8 kcal/min）折算，UI 标注「仅为约数」。

### 6.3 标签生成

| 标签 | 条件 |
|---|---|
| 高蛋白 | 蛋白质 ≥ 28 g |
| 低钠 | 钠 ≤ 700 mg |
| 轻热量 | 热量 ≤ 520 kcal |
| 零糖饮料 | 饮料糖 ≤ 1 g |
| 有蔬果 | 配餐含蔬果（玉米杯 / 苹果片） |
| 均衡 | 总分 ≥ 75 |
| ⚠ 警告标签 | 钠 > 1000 mg、脂肪供能比 > 38%、糖 > 45 g、热量超出目标区间 1.25 倍 |

### 6.4 轮换算法

```js
available = ranked.filter(r => !history.includes(r.combo.id))   // 优先未展示
if (available.length < 3) { history = history.slice(-3); ... }   // 渐进回收最旧记录
if (available.length < 3) { available = ranked; reused = true }  // 候选极少：复用并标记
picked = 贪心取分数最高、且主餐互不相同的 3 个
history = (history + picked).slice(-9)                           // 保留最近 3 轮
```

候选不足时前端进入**空结果态**，明确给出可执行建议：把预算提到「最低可行组合价」、取消某项忌口、
或把多目标改回单选。

---

## 7. 复现与刷新

```bash
# 1. 抓取（在 WorkBuddy 对话中让 Skill 执行，或手工调用 MCP 工具）
#    query-nearby-stores → query-meals → list-nutrition-foods
#    按 §4 映射后写入 data/mcp_snapshot.json

# 2. 校验 + 派生 fallback + 生成浏览器镜像
python tools/build_data.py
#    [OK] 数据校验通过 · 商品数 32 · 主餐 10 / 配餐 8 / 饮料 14 · 价格 5.0–34.5 元

# 3. 跑测试
node tests/run_tests.mjs

# 4. 打开页面
start index.html
```

`build_data.py` 会强制校验：必填字段、`category` 合法性、价格为正、营养非负、过敏原枚举合法、
三个品类均非空、`productCode` 不重复。任何一条不满足都不会写入，避免把坏数据带进前端。

---

## 8. 业务价值

| 对用户 | 对麦当劳 |
|---|---|
| 把「吃什么健康」从开放问答变成 3 个可执行选项，决策成本从分钟级降到秒级 | 把营养数据变成可被消费的推荐场景，提升健康心智与到店转化 |
| 过敏原/忌口是硬约束，过敏人群敢用 | 套餐结构（主餐+配餐+饮料）天然拉高客单价，且始终锚定用户预算 |
| 预算锚定在总价，不会「看着便宜结账超支」 | 无下单/支付动作，零交易风险，适合作为营销侧轻应用 |

---

## 9. 局限与合规

1. **过敏原与忌口为启发式映射**，不是麦当劳官方过敏原声明；严重过敏请以门店与包装为准。
2. **糖为碳水折算估算**，标记 `sugarEstimated: true`。
3. **营养为按名称匹配的估算值**，门店实际配方可能调整；不宣称「官方实时营养数据」。
4. **不做医疗诊断、治疗或减重承诺**，营养建议仅供参考，特殊人群请咨询专业人士。
5. 演示模式数据为固定快照副本，UI 常驻「演示模式」徽章，不与实时数据混淆。
