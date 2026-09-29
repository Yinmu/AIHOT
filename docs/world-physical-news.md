# 世界模型与物理 AI · CoolJev

Yinmu 基于数字生命卡兹克的 AIHOT 改造。页面由 CoolJev 的 `/news/` 展示，本仓库运行后台采集、Jev 判断、审核与公开快照导出。保留上游 LICENSE、NOTICE 和第三方声明，新增改动同样使用 MIT。

## 已实现与边界

- 独立 `world-physical-v1` 专题：世界模型、机器人学习、具身智能、VLA、仿真和学习控制。普通聊天模型、娱乐视频和普通汽车新闻不因关键词入选。
- Score 使用 6 个语义等级（API 原始索引 0–5），先线性映射到原策略 0–10 分再做噪声上限与加权；新策略版本不复用旧的非法 11 等级请求。接口限制参照 https://docs.typesafe.ai/primitives/score 。
- 请求、严格响应校验和回执身份与泛 AI 离线评测分开。评分阈值暂用原值作为实验起点，尚无垂直准确率结论。
- 按需 CLI 复用 RSS、安全原文提取、数据库和付费回执，不启动原精选、全文翻译、榜单、日报、通知或自动恢复任务。
- 默认只使用 Jev。入选后处于 `awaiting-summary`，可以由维护者提交短摘要草稿；只有显式使用 `--summary` 才调用已配置的生成模型。
- 所有条目都需显式编辑审核才导出；审核者必须如实记录，人名与自动化代理不能混淆。材料变更使旧审核失效；每次审核对应的判断记录拥有独立 `news-<decisionId>` 发布 ID，策略升级不会复活旧版本。
- 未设置定时运行。真实服务调用、人工审核、正式域名发布需分别完成，不能把本地测试当成线上完成。

## 运行前

Node >=24.11 和 PostgreSQL。使用专门的新闻数据库，不与正在运行的上游 worker 共用。复制 `news.env.example` 的变量名到被忽略的 `.env.news.local`，通过本地环境或 Secret 注入凭据。不要提交任何真实 Key、数据库密码、原文、回执、运行日志或私有草稿。

`AIHOT_NEWS_ONLY=true` 会阻止误启动通用 worker；CLI 还会关闭推送、IndexNow 和付费正文补全。专题的未知付费回执不参与通用自动放行，需核对服务端计费情况后通过原有 `releaseReceipt` 管理能力显式处理。

```sh
node --env-file=.env.news.local scripts/migrate.ts
npm run news -- init
npm run news -- collect --limit 3
```

初始三个一手候选流：Google DeepMind、NVIDIA、Berkeley AI Research。`init` 不启动定时采集，这些 sources 在通用调度器中保持 disabled，仅专题 CLI 按需读。`news_sources.allowed=false` 可停用专题来源并在下一次导出撤销其已审核内容。上线时按各来源使用条件限制展示，网页只展示短摘要与原文链接，不展示原图或全文。

采集 `--limit` 是每源每批上限，CLI 最大 20；已读条目的指纹保存在 cursor 中，后续批次继续未处理条目。正文未取得的条目留待处理，至少隔一小时才再次抓取；内容超限、抓取不完整和主题不确定都不直接发布。先检查实际来源产出，再扩大采集量。

## 判断与费用

Jev 使用 `TYPESAFE_API_KEY`。首次试跑建议把数据库 `budgets` 的 `typesafe` 每分钟、每小时、每天请求上限都设为 3，再执行：

```sh
npm run news -- process --live --limit 3
npm run news -- list --limit 20
```

`--live` 是显式付费开关，默认没有模型调用。`--id ARTICLE_ID` 可指定一个已采集条目。成功回执按请求内容复用；未知结果不自动重付。预算为请求次数上限，不是金额上限，费用仍须结合服务账单核对。原始回执只留在私有数据库。

需要自动摘要时，另外配置 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 和正数的 `llm` 请求预算，使用 `process --live --summary`。不自动选择供应商或降级到原评分模型；无关新闻不会进入摘要调用。

### 离线重放已有响应

如果服务已返回响应，但旧版本本地校验失败，可修复校验后执行：

```sh
npm run news -- replay --id ARTICLE_ID --receipt RECEIPT_ID
```

不需要 Key，也不发送请求；必须匹配当前文章版本、策略版本和完整请求哈希。原回执的失败历史保留，新判断引用该回执。两位小数的概率和 Score 使用归一化概率区间的可行期望校验，不随意放宽错误响应。

2026-09-30 的限量真实试跑已返回 3 份响应：2 条 physical-ai 待复核、1 条 unrelated 拒收。其中 ER 2 已由 Codex 辅助核对官方原文、记录编辑采纳理由、生成独立短摘要并完成显式审核，公开快照含 1 条。原 Jev 的 review / uncertain_sig 不变，resolved_decision 单独记录编辑采纳。另一篇同轮发布暂不重复收录，无关项继续拒收。此记录不表示 Yinmu 本人已审核，也不证明自动采纳准确率。

## 待复核项的编辑决议

Score confidence 表示各评分等级的概率集中程度，不能直接读作新闻真实性。参照 [官方 Score 文档](https://docs.typesafe.ai/primitives/score)。默认模型门槛未降低。

仅当专题与相关性已确认，且待复核原因属于价值评分或软性降分项的不确定性，维护者才能在阅读原文后显式解决：

```sh
npm run news -- resolve --id DECISION_ID --action select --reviewer ACTUAL_REVIEWER --reason '核对了哪些事实，为什么值得收录'
```

必须使用真实执行者名称；代理协助应写明代理身份。原 decision、reason_codes、回执保留，resolved_decision / resolved_by / resolution_reason / resolved_at 单独记录，不能重复覆盖。材料不完整、主题未知、明确拒收、已撤回或旧版本不能通过此入口强行纳入。编辑采纳后仍需草稿和最终审核，不能直接公开。

## 草稿与编辑审核

默认 Jev-only 模式：维护者阅读原文后准备私有 JSON 文件，仅包含 `title` 和 `summary`。标题最多 180 字符，摘要最多 600 字符，不复刻全文或添加无依据数据。厂商效果声明保留归因。

```sh
npm run news -- draft --id DECISION_ID --file .data/news/draft.json
npm run news -- list --limit 20
npm run news -- review --id DECISION_ID --reviewer Yinmu --reason '已核对原文、摘要、日期和重复事件' --event EVENT_KEY
```

`--event` 使用能识别同一事件的稳定标识，例如论文 ID 或一次模型发布的固定短名；同一事件不能重复批准两个有效条目。新的实质进展使用新的事件标识。审核时核对标题、短摘要、原始日期、主题和出处；不要把模型置信度视为事实核验。草稿一旦提交即冻结，不能悄悄改写已审核文本。

`review --action reject` 会撤销对应发布版本。完全撤回可执行：

```sh
npm run news -- withdraw --id news-123 --reviewer Yinmu --reason '原文更正或移除请求'
npm run news -- export --out .data/news/snapshot.json
```

撤回只针对明确的发布版本 ID；如需撤回整个来源，停用 `news_sources.allowed` 后重新导出。重新发布必须有新的有效判断版本和人工审核；旧撤回记录不删除。

## 导出和接入 CoolJev

```sh
npm run news -- export --out .data/news/snapshot.json
```

输出 `snapshot.json` 和 `snapshot.json.removals.json`。它们只来自 `publication/world-physical.ts` 的专题公开读取入口：检查当前材料版本、当前 profile/policy、入选、完整标题摘要、最新人工批准、来源权限和撤回。

在 CoolJev 仓库运行：

```sh
node scripts/news-import.cjs --snapshot /absolute/path/snapshot.json --removals /absolute/path/snapshot.json.removals.json
npm run build
node scripts/check-news-browser.cjs
```

前端导入器拒绝多余字段、不安全链接和疑似密钥；撤回清单累积合并，先落盘撤回再替换快照。旧快照默认拒绝，需要回滚时显式传 `--allow-rollback`，且仍应用累积撤回。正式发布另用 CoolJev 受控的发布基线；不要上传整个工作区或后台 `.data`。部署失败保留当前线上版本，但撤回操作需在正式域名确认移除才算完成。

## 验证

```sh
npm run typecheck
# 使用新建、已迁移、名称以 _test 或 _ci 结尾的隔离库。
DATABASE_URL=... npm test
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts
```

集成测试只访问本地 stub，验证真实回执和数据库流程，不代表模型质量。首次上线需单独保存真实采集、Jev 试跑、人工审核、公开导出和线上浏览器证据。未实现定时更新前，页面不宣称实时或每日更新。
