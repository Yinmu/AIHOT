# Jev 新闻采纳实验

此分支在原有精选流程旁边增加离线评测，不改正式精选、信源、站名或生成模型。采纳表示进入精选候选，不代表最终进入日报。

## 判断流程

沿用原项目七类内容和五轴权重；Jev 返回相关性、内容类型、五轴分布和噪声信号，代码计算加权分及上限。Score 使用期望值（可能有小数）；旧门槛仅作实验起点，不代表已经校准。

- `select`：满足当前实验门槛。
- `reject`：明确无关、分级不参与精选，或分数不足。
- `review`：材料不足、分类/评分低置信度、噪声信号不明确或主张缺乏支撑。原对照模型的内容过滤拒答也记为 review。
- `null + error`：配置、预算、网络或响应校验失败。绝不当作正常拒选。

置信门槛 0.8 只是实验参数，不是真实准确率。当前未实现基于五轴联合分布的门槛跨越概率；待用真实数据决定是否需要。短公告只要正文完整不因长度被拒绝；无正文待复核。正文超过 30,000 字符直接报错，不静默截断改变对照材料。

新闻只在 state 中，问题和规则来自受控代码。信源分级仅用于代码门槛，不输入评分；gold 标签、原模型分数不发给 Jev。单篇判断不尝试凭空识别全站重复。摘要、翻译、日报仍由原模型负责。

## 准备与运行

需要 Node >=24.11、PostgreSQL、`npm ci` 和已应用迁移的数据库。密钥只填本地 `.env`，不要提交。开发默认关闭采集、模型、飞书和 IndexNow；此 CLI 不启动采集或推送。

```sh
npm ci
# 在本地 .env 填 DATABASE_URL，并先关闭 MODEL_CALLS_ENABLED / COLLECT_ENABLED 等安全阀
npm run db:migrate
# 不需要密钥或数据库连接，不产生模型调用
npm run eval:jev -- --gold industry/gold.example.jsonl --dry-run
```

`industry/gold.example.jsonl` 是上游两条虚构示例，只可演示格式，不是质量证据。

真正评测前，从自己将使用的信源准备 100–200 条新闻，用 docs/selection.md 的 JSONL 格式人工标注。每条 gold.decision 为 select/reject/either，samplingContext.benchmarkSplit 为 development/holdout，caseId 必须唯一。不能把模型自己标出的答案冒充人工 gold。未标注数据会被 CLI 拒绝。

```sh
# 本地 .env 设置 TYPESAFE_API_KEY；对照模型需要原有 LLM_* 配置
# 此命令明确启用付费评测。n 限制样本数，typesafe 预算限制请求数。
MODEL_CALLS_ENABLED=true npm run eval:jev -- --gold .data/gold.jsonl --split development --n 100 --baseline default --label 'Jev 开发集对照'
# 冻结规则后再验证留出集，不能用留出集反复调参数
MODEL_CALLS_ENABLED=true npm run eval:jev -- --gold .data/gold.jsonl --split holdout --n 100 --baseline default --label 'Jev 留出集'
```

不传 `--baseline` 只运行 Jev；`--no-import` 只保存 JSON，不导入后台。样本按输入顺序截取前 n 条，两组模型使用完全相同的 caseId。需要分层时先在输入文件中安排好抽样；当前 CLI 不承诺随机或分层抽样。

## 查看结果

命令输出 JSON 报告绝对路径和 SelectBench runId，默认保存在 `.data/eval/`。后台 `/admin/selectbench` 可比较入选/拒选/待复核并过滤错例。报告保留 Jev 原始信号、原始分数、阈值、原因码、回执、耗时、输入文件哈希与策略哈希。完整信号在本地报告和回执中；SelectBench 保存用于浏览的结果摘要。

- 精确率 = 正确采纳 / 全部明确采纳。
- 召回率 = 正确采纳 / 所有标为该选的样本；待复核/失败中的该选样本也在分母。
- 准确率 = 明确判断正确 / 所有非 either 样本；coverage 为明确作出决定的比例。
- decisiveRecall 另列仅明确决定的召回率，不可替代整体召回率。
- errors 和 review 单独统计；分母不存在时指标为 null，不虚构为 0。
- token 汇总来自成功回执并包括缓存复用，不等于此次实际账单；失败尝试的用量以 receipt_attempts 为准，金额未知时 cost=null。
- `--baseline default` 只指定对照评分模型；预筛仍按上游 PREFILTER_MODEL / 后台配置执行。
- 有调用错误时仍保存报告并退出码 2；输入错误在付费调用前失败。

## 费用与异常

每次 Jev 请求经过原有 paidRequest 回执。预算迁移为 typesafe 建立每分钟 60、每小时 300、每天 1000 次上限；这是调用次数，不是金额预算。缺少预算行时本适配器拒绝调用。相同原文、问题、模型和策略复用回执。

超时或 5xx 属于可能已付费但结果未知，不立即重发；遵循原回执恢复机制。明确拒绝请求或无效结构返回记录为失败。默认仅访问固定 TypeSafe HTTPS 地址，测试环境可用本机 HTTP 模拟服务。

## 当前交付边界

已实现离线 Jev 路径、原模型对比入口、SelectBench 导入/待复核显示、测试。未启用线上实时旁路任务，未接管正式精选，未部署，未调用真实付费模型。没有人工金标，不能声称 Jev 选得更准、更快或更便宜。后续需先完成人工标注与真实模型对比，再讨论接管。
