# Jev 新闻采纳实验 · by Yinmu

**让 Jev 判断新闻是否值得采纳，让生成模型负责写作。** 这是 [Yinmu](https://github.com/Yinmu) 基于 [数字生命卡兹克的 AIHOT](https://github.com/KKKKhazix/AIHOT) 制作的独立实验分支。

关注我的其他 Jev 实践：**[CoolJev](https://cooljev.com) · [GitHub / Yinmu](https://github.com/Yinmu)**。

## 来源与署名

- **原项目与原作者**：[AIHOT](https://github.com/KKKKhazix/AIHOT)，数字生命卡兹克（[KKKKhazix](https://github.com/KKKKhazix)）。新闻采集、网站、后台、原精选流程、事件归组与日报框架来自上游。
- **本分支维护与改造**：[Yinmu](https://github.com/Yinmu)，在上游框架上增加 Jev 新闻采纳对比实验。
- **起始版本**：上游提交 [`44578fa`](https://github.com/KKKKhazix/AIHOT/commit/44578fa11da55f2e863900752653e0c221f6cf70)。本分支为 `codex/jev-news-selection`。
- 本项目保留上游 [MIT LICENSE](LICENSE)、[NOTICE](NOTICE) 和第三方材料声明。新增改动同样按 MIT 发布。AIHOT 名称和 Logo 不在上游 MIT 授权范围内；下方上游截图仅保留作项目来源介绍，部署自己的站点请使用自己的品牌。
- 本分支是独立改造，不代表卡兹克、AIHOT 或 TypeSafe 官方出品、合作或背书。新闻内容权利归各信源所有。

## Yinmu 在这个分支做了什么

| 改动 | 作用 |
|---|---|
| Jev 原生接口适配 | 使用 `state + questions` 判断新闻，复用回执、预算限制和异常处理 |
| 结构化采纳判断 | 判断相关性、内容类型、五轴价值与噪声，输出采纳／拒绝／待复核 |
| 独立对比评测 CLI | 对同一批人工标注样本比较 Jev 与原有模型；保留分歧、信号和回执 |
| SelectBench 扩展 | 显示及筛选待复核，报告覆盖率，避免将调用失败误记为拒选 |
| 测试与使用文档 | 提供接口、规则、回执、报告测试及可复现验证记录 |

**当前是离线实验，不接管正式精选，也没有真实模型准确率或成本优势结论。** 摘要、翻译、日报仍使用上游生成模型流程。详见 [使用说明](docs/jev-selection.md)、[验证记录](docs/jev-selection-verification.md) 和 [安全说明](SECURITY.md)。

## 密钥不属于开源代码

仓库只提供空值或明确的测试配置。真实 `TYPESAFE_API_KEY`、`LLM_API_KEY`、数据库密码和其他凭据仅保存在本地环境或部署平台的 Secret 中。不要把 `.env`、日志、数据库、回执或真实评测数据提交到 Git。密钥扫描通过也不能代替人工检查；具体提交前检查见 [SECURITY.md](SECURITY.md)。

---

## 上游项目原始介绍

以下保留原作者介绍、截图和署名，描述的是上游项目，不是对本分支效果的承诺。

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="AIHOT：每个行业，都可以有自己的 AIHOT。很多条信源流进中间的精选，再分给法律、人力资源、金融等各个行业" width="100%">
  </picture>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-176b75?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Node.js-24-176b75?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 24">
  <img src="https://img.shields.io/badge/PostgreSQL-17-176b75?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17">
  <img src="https://img.shields.io/badge/Docker-Compose-176b75?style=flat-square&logo=docker&logoColor=white" alt="Docker Compose">
  <a href="https://aihot.news"><img src="https://img.shields.io/badge/demo-aihot.news-202a30?style=flat-square" alt="aihot.news"></a>
</p>

<p align="center">
  <b>一个自己找热点、自己写日报的网站框架。</b><br>
  把信源换成你的，把精选标准换成你的 KnowHow，它就是你的行业热点站。
</p>

<p align="center">
  <a href="#跑起来">跑起来</a> ·
  <a href="docs/customize.md">改成你的行业</a> ·
  <a href="#它是怎么工作的">它是怎么工作的</a> ·
  <a href="#文档">文档</a>
</p>

<br>

## 这是什么

[AIHOT](https://aihot.news) 是我做的一个 AI 热点网站。它每天从一批信源里收资料，用大模型先筛一遍、再独立打两次分，挑出真正值得看的，写成中文标题和摘要；把不同来源说的同一件事聚成一个事件，按有多少人在说排出热点；每天早上出一份日报。

这个仓库是它的完整框架：网站、后台、精选流程、聚簇和热度算法，**所有提示词的原文和入选门槛**，都在这里。

## 为什么开源

这半年，很多做法律、做 HR、做金融、做贵金属的朋友问我，能不能也给他们的行业做一个。

我做不了。我不懂你们的行业，不知道哪些信源有用，也不知道什么样的消息，对你们来说才叫热点。

但你们懂。

既然我没办法满足所有人，那就把火种交到大家自己手上。

## 说在前面

- **我不是专业的开发者。** 我是设计师出身，半年前还看不太懂代码。这套代码是我和 AI 一起重写的，比以前干净了很多，但一定还有写得不好的地方。发现问题欢迎提 Issue，我不一定能很快回复，先说声抱歉。
- **这是一份快照。** 它来自 AIHOT 正在线上跑的代码，不是精心打磨的通用框架。以后 AIHOT 的更新，我会尽量同步过来，但没法保证每一次都同步。
- **里面没有 AIHOT 的信源名单和运营数据。** 仓库带了 18 个公开的海外 AI 资讯源做示范，够你跑起来看效果；真正的信源，要换成你自己行业的。
- **请不要用 AIHOT 的名字和 Logo。** 换上你自己的名字，它就是你的站。

## 它是怎么工作的

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-dark.png">
  <img src="docs/assets/how-light.png" alt="六步：采集、预筛、两次评分、写作、聚簇、热点与成刊" width="100%">
</picture>

一条资料从信源进来，先判重，再预筛；可能重要的独立打两次分，过了门槛才进精选；然后写中文标题和摘要，和别的报道聚成事件，算进热度，最后进日报。每一步的提示词都在 [`industry/prompts/`](industry/prompts/)，改标准不用改代码。详见 [精选与校准](docs/selection.md)。

### 聚簇与热点

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/cluster-dark.png">
  <img src="docs/assets/cluster-light.png" alt="五个来源的报道聚成一个事件，事件进入当前热点榜" width="100%">
</picture>

同一件事，官网发一篇、媒体转十篇、X 上吵一天，读者只需要看到一次。AIHOT 把它们聚成一个**事件**：先用标题摘要的向量在最近两周里找候选，再让模型判断是同一件事、后续进展，还是两件事；拿不准的合并，换一家模型再确认一遍。

**热度**按事件算，不按文章算：48 小时内，每个独立来源只算一次，24 小时减半。重复抓取不会多算，一家媒体发十篇也只算一次，所以排在前面的，是真正有很多人在说的事。

### 速度

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/perf-dark.png">
  <img src="docs/assets/perf-light.png" alt="AIHOT 线上实测：页面中位数 10 毫秒，95% 在 50 毫秒内；接口中位数 6 毫秒，95% 在 12 毫秒内；文章页 95% 在 14 毫秒内" width="100%">
</picture>

## 你会得到什么

| | |
|---|---|
| **六种信源** | RSS、网页列表、JSON 接口、X 账号、微信公众号，以及你自己脚本推送进来的内容。信源分级（官方一手 / 媒体个人），抓取频率按产出自动调整 |
| **精选** | 预筛，同一份评分标准独立打两次分，再按信源分级的门槛决定入选。提示词和门槛全部公开，全部可以改；用你自己标注的样本在 SelectBench 里校准 |
| **写作** | 中文标题、答案先行的摘要、推荐理由、标签，外文全文翻译；防止模型把原文没提到的公司写进标题 |
| **聚簇** | 不同来源报道的同一件事聚成一个事件，后续进展挂在同一个事件下，事件页有综述；人工改过的归属不会被覆盖 |
| **热点** | 按事件算热度：独立来源越多越靠前，X 上的讨论也算进来；和 6 小时前比，涨得快的标上升，新出现的标“新” |
| **日报、周报、月报** | 每天 08:00 出日报，每周一出周报，每月 1 日出月报，按分类分节，带导语 |
| **主题与搜索** | 公司、方向、内容形态三类主题页；标题摘要搜索和全文相关搜索 |
| **给 Agent 用** | RSS（精选、全部、全文、日报）、公开 API、MCP、`llms.txt`，同一份内容给人看也给 Agent 用 |
| **后台** | 信源管理与试抓、内容诊断、精选评测、每一步单独换模型、付费服务的预算熔断、运行记录与告警 |
| **AI 专属模块** | 模型榜（汇总多家公开评测，方法公开）和 Codex 重置监控。别的行业一个开关关掉 |

## 看一眼

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/shots-dark.png">
  <img src="docs/assets/shots-light.png" alt="首页的当前热点与精选，关于页的信源河" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/board-dark.png">
  <img src="docs/assets/board-light.png" alt="模型榜" width="100%">
</picture>

<p align="center"><sub>截图来自用示范信源跑起来的本地站，站名是默认的 MyHOT。</sub></p>

## 跑起来

需要 [Docker](https://docs.docker.com/get-docker/)，和一个 OpenAI 兼容的模型 API Key（DeepSeek、千问、智谱都可以）。

```bash
git clone https://github.com/KKKKhazix/AIHOT.git myhot
cd myhot
node scripts/init-env.ts --llm-key <你的模型 API Key>
docker compose up -d --build
```

打开 <http://localhost:3000>。后台在 `/admin`，管理员密码在 `.env` 的 `ADMIN_PASSWORD` 里。一两分钟后开始有内容，第一次导入的资料大约半小时处理完。

机器上没有 Node、服务器在中国大陆、要配域名和 HTTPS，见 [部署](docs/deploy.md)。

## 把它改成你的行业

最省事的办法：打开你的 Agent（Claude Code、Codex 都可以），把这个仓库交给它，然后说：

```text
请读 AGENTS.md 和 docs/customize.md，把这个站改成「法律」行业的热点站。
我关心的是：……（你想盯哪些信源，你觉得什么消息重要、什么不重要，越具体越好）。
```

要改的东西几乎都在 [`industry/`](industry/) 这一个文件夹里，代码基本不用动：

| 文件 | 改什么 |
|---|---|
| `site.ts` | 站名、行业词、首页文案、关于页 |
| `taxonomy.ts`、`topics.json` | 分类、标签、主题 |
| `sources.json` | 首次启动时导入的信源 |
| `prompts/` | 精选标准和写作要求。**你的行业 KnowHow，就写在这里** |
| `selection.ts` | 入选门槛 |
| `features.ts` | 模型榜、Codex 重置监控的开关 |
| `brand/`、`pages/` | 图标、使用规则和隐私说明 |

最值得花时间的是评分标准（`prompts/selection-score.md`）和门槛：拿一两百条你自己标注过的资料，用 `scripts/eval-selection.ts` 跑一遍，看它选得准不准，再回去改。怎么做写在 [精选与校准](docs/selection.md) 里。

## 文档

| 文档 | 内容 |
|---|---|
| [把它改成你的行业](docs/customize.md) | 站名、分类、信源、提示词、门槛、品牌，一步一步来 |
| [信源](docs/sources.md) | 六种信源怎么配，分级和全文，外部推送接口 |
| [精选与校准](docs/selection.md) | 一条资料怎么变成精选，怎么用自己的样本校准 |
| [部署](docs/deploy.md) | Docker、域名和 HTTPS、中国大陆、更新、备份、花多少钱 |
| [架构](docs/architecture.md) | 三个进程、几条不变的规则、目录、对外出口 |
| [模型榜与 Codex 重置监控](docs/leaderboard.md) | 两个 AI 专属模块 |

技术栈：Node.js 24 · TypeScript · React Router（服务端渲染）· Fastify · PostgreSQL · pg-boss · Tailwind CSS · Docker Compose。

## 最后

AIHOT 曾经只是我无数个深夜里，一个很小、很小的念头。

我不知道它会被改成什么样子，会走到多远的地方。但这可能就是开源最浪漫的地方。

剩下的路，就交给你们了。

<p align="right">—— 数字生命卡兹克</p>

## 许可

代码使用 [MIT 许可证](LICENSE)。AIHOT 的名字和 Logo 不在许可范围内。字体、模型厂商和评测来源的标志各有自己的许可和商标归属，见 [NOTICE](NOTICE)。

---

<sub>**In English:** AIHOT ([aihot.news](https://aihot.news)) is an AI news site that collects from many sources, lets a language model filter and score every item twice, writes Chinese headlines and summaries, clusters reports of the same story into one event, ranks events by how many independent sources discuss them, and publishes a daily briefing. This repository is its complete framework, including every prompt and threshold. Hand it to your coding agent with `AGENTS.md` and `docs/customize.md` to turn it into a news site for your own field. The documentation is in Chinese.</sub>
