# workbuddy.md · 开发对话上下文

> 本文件用于核验本项目是否符合 WorkBuddy 专项奖励条件，记录本次开发在 WorkBuddy 中完成的主要工作与关键决策。

## 1. 项目基本信息

| 项 | 内容 |
|---|---|
| 项目名称 | 麦麦营养搭配咪 |
| 一句话介绍 | 在预算、忌口过敏原、饮食目标约束下，用麦当劳 MCP 真实菜单配出 3 套「主餐+配餐+饮料」健康套餐的像素风 Skill |
| 开发工具 | WorkBuddy（Agent 模式） |
| 开发时间 | 2026-10-22 |
| 核心依赖 | 麦当劳 MCP Server `https://mcp.mcd.cn`（连接器 `mcd-mcp`） |
| 主要文件 | `index.html`、`js/*.js`、`data/*.json`、`tools/build_data.py`、`tests/run_tests.mjs` |

## 2. 在 WorkBuddy 中完成的工作

### 2.1 规则研读与方案设计

1. 读取活动仓库 `README.md`，核对交付要求（5 件套文件、公开仓库、Issue 报名格式、时间窗、WorkBuddy 奖励条件），
   形成「规则核对清单」，并确认 `CONTEST_DECLARATION.md` 必须原文提交、不可改动。
2. 用 ToolSearch 读取 `mcd-mcp` 全部工具的真实 schema，筛出与营养搭配相关的 4 个只读工具，
   明确排除下单类工具（`create-order` / `calculate-price`）。
3. 输出建议架构、文件树、数据模型、评分模型与测试计划，经确认后进入实现。

### 2.2 MCP 实测与真实数据抓取

在 WorkBuddy 对话中直接调用 MCP 完成三连调：

| 步骤 | 调用 | 实得 |
|---|---|---|
| 1 | `query-nearby-stores(beType=1, searchType=1)` | 报错「收藏餐厅为空」，得到需补城市+关键词的提示 |
| 2 | `query-nearby-stores(beType=1, searchType=2, city=上海, keyword=人民广场)` | 5 家门店，选定 `1450713` 华旭国际大厦餐厅 |
| 3 | `query-meals(1450713, orderType=1, beType=1)` | 分类树 + `meals{}`，含 `productCode` 与 `currentPrice` |
| 4 | `list-nutrition-foods()` | 130 条营养记录（无 code、无价格、无过敏原、无糖） |

**关键发现**：价格在 `query-meals`、营养在 `list-nutrition-foods`，两者只能按餐品名对齐；
接口**不提供**过敏原与糖字段。这直接决定了三个设计决策：名称匹配清洗、`allergen_map.json` 启发式映射、
`allergen_map.json`/`sugarEstimated` 必须在 UI 与文档中双重声明。

### 2.3 实现与调试

1. 生成 32 条可用商品的 `data/mcp_snapshot.json`（主餐 10 / 配餐 8 / 饮料 14，价格 5–34.5 元），
   每条记录标注 `priceSource` 与 `nutritionSource`，保证可溯源。
2. 编写 `tools/build_data.py`：结构校验 → 派生 fallback → 生成 `window.MCD_*` 的 `.js` 镜像
   （关键点：`file://` 下 `fetch` 被 CORS 拦截，用脚本镜像才能双击即用）。
3. 实现六个前端模块：`data / filter / combo / score / cat / app`，像素风 UI 用纯 CSS 手写，
   无框架、无构建、无外链字体，保证离线可跑。
4. 编写 22 条 Node 测试，首次运行 2 条失败（「纯牛奶」被「牛」误判为牛肉、「燕麦奶铁」被误判含乳），
   定位为关键词映射假阳性 → 在 `allergen_map.json` 增加 `exceptKeywords` → 重新构建 → 22/22 通过。
5. 用 `node --check` 逐个校验脚本语法，并校验 `app.js` 引用的 19 个 DOM id 全部存在于 `index.html`。

### 2.4 测试与文档

- 22 条自动化测试全绿（模式判定、过敏原零泄漏、预算约束、组合结构、评分单调性、轮换不重复）。
- 编写浏览器端 `tests/test.html`（10 条冒烟测试）与 `tests/TEST_PLAN.md`（含需求对照表与风险表）。
- 编写 `README.md`（目标用户 / 快速开始 / 示例 / 边界）、`MCP_INTEGRATION.md`（调用链 / 字段映射 / 评分公式 / 降级）。

## 3. 关键决策记录

| 决策 | 备选方案 | 选择理由 |
|---|---|---|
| 静态 HTML + 原生 JS | React/Vite | 赛事评审需要「双击即看」，零构建零依赖最稳；`file://` 也能跑 |
| JSON + `.js` 镜像双份数据 | 只留 JSON | 只留 JSON 在 `file://` 下会因 fetch 限制失效 |
| 只推荐能匹配到营养的商品 | 给缺失商品补估值 | 补估值等于伪造官方营养数据，违反需求第 8 条 |
| 过敏原用关键词映射 | 不做过敏原过滤 | 需求把过敏原列为硬约束，宁可保守误杀也不能漏杀 |
| 不下单、不算价 | 接 `calculate-price` | 该工具需完整下单上下文，且会引入交易风险，与作品定位不符 |
| 权重集中为常量 | 分散在逻辑里 | 便于评审调参与复现，同时满足「公式写在代码中」的要求 |

## 4. 产物清单

```
maimai-nutrition-mi/
├── SKILL.md  README.md  MCP_INTEGRATION.md  CONTEST_DECLARATION.md  workbuddy.md
├── index.html  css/style.css
├── js/{data,filter,combo,score,cat,app}.js
├── data/{mcp_snapshot,fallback_data,allergen_map,cat_lines}.{json,js}
├── assets/pixel-cat-walk.gif
├── tools/build_data.py
└── tests/{run_tests.mjs,test.html,TEST_PLAN.md}
```

## 5. 复现步骤

```bash
python tools/build_data.py     # 数据校验 + 生成镜像
node tests/run_tests.mjs       # 22 条测试
start index.html               # 双击即用（演示模式）
# 配置 mcd-mcp 连接器并刷新快照后 → 实时 MCP 模式
```
