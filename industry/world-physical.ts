// Independent topical policy; thresholds remain experimental until labeled evaluation.
import { AXES, CAPS, JEV_RULES } from "./jev-selection.ts";
export const WORLD_PROFILE = "world-physical-v1";
export const WORLD_POLICY_VERSION = "world-physical-policy-v2-six-level";
export const WORLD_RULES = JEV_RULES + " 本专题读者是关注世界模型、物理 AI 的研究者、开发者、创业者和长期读者。按该领域的实质进展评价，不要求大众立即使用。";
export const WORLD_AXES = {
  ...AXES,
  sig: "实质份量：世界模型、机器人学习、具身智能、VLA、仿真及真实世界控制的能力、研究或部署是否有实质进展。",
  reson: "共振面：对世界模型和物理 AI 领域研究者、开发者和长期读者的意义；专业论文不因大众难懂而降分。",
  act: "可用性：论文方法、代码、数据集、仿真器、可复现评测或部署经验是否可学习和复用。前沿研究不因尚未商用而否定。",
};
export const WORLD_CAPS = {
  ...CAPS,
  narrow_research: {instructions:"是否只有缺乏任务意义或可复现依据的微小基准变化？有证据支持的世界表示、机器人学习、评测、数据集或仿真方法进展不因专业受众小而属于此类。",limits:{sig:4,reson:3}},
};
export const WORLD_TOPICS = {
  "world-models": "学习环境状态、动力学、行动条件预测或交互世界模拟；空间或视频生成需有明确世界表示、模拟或决策证据。",
  "physical-ai": "机器人学习、具身智能、VLA、sim-to-real、仿真训练和学习控制；自动驾驶仅限直接相关研究。",
  both: "同时有世界模型和物理 AI 的实质内容。",
  unrelated: "充分材料明确只有普通 AI、娱乐视频生成、机械硬件、普通车型销量或泛融资宣传。",
  unknown: "材料不足或边界不清，不能可靠判定专题。",
};
