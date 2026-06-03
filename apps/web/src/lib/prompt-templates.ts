export type PromptTemplate = {
  id: string;
  title: string;
  prompt: string;
};

const TEMPLATES: Record<string, PromptTemplate[]> = {
  chat: [
    {
      id: "chat-help",
      title: "寻求帮助",
      prompt: "请用简洁准确的方式回答我的问题，并在必要时给出步骤和示例。",
    },
    {
      id: "chat-compare",
      title: "方案对比",
      prompt: "请帮我对比下面这些方案的优缺点，给出推荐和理由：\n- 方案 A：...\n- 方案 B：...",
    },
    {
      id: "chat-summarize",
      title: "要点总结",
      prompt: "请把下面这段内容总结成 3 条要点，每条不超过 30 个字：\n\n<粘贴文本>",
    },
  ],
  coding: [
    {
      id: "coding-feature",
      title: "实现功能",
      prompt: "请用 TypeScript 实现一个带输入校验、错误处理和单元测试的 API client。",
    },
    {
      id: "coding-refactor",
      title: "重构模块",
      prompt: "请把以下代码重构为单一职责，保留外部行为不变，并说明每一处改动的原因：\n\n```ts\n// 粘贴代码\n```",
    },
    {
      id: "coding-bug",
      title: "排查 Bug",
      prompt: "以下代码在生产环境偶发崩溃，请分析最可能的原因并给出修复：\n\n```ts\n// 粘贴代码\n```\n\n报错信息：\n<粘贴错误>",
    },
  ],
  code_review: [
    {
      id: "code-review-default",
      title: "综合审查",
      prompt: "请审查这段代码的可靠性、安全性和可维护性，并给出可执行的修改建议。",
    },
    {
      id: "code-review-security",
      title: "安全审查",
      prompt: "请从安全角度审查以下代码，重点关注注入、权限、敏感信息泄露、输入校验和重放风险：\n\n```ts\n// 粘贴代码\n```",
    },
  ],
  document_analysis: [
    {
      id: "doc-analysis-default",
      title: "需求大纲",
      prompt: "请基于上传的需求文档，生成一份系统设计方案大纲，包括架构图（Mermaid）、核心模块说明、技术栈建议和接口定义。",
    },
    {
      id: "doc-analysis-requirements",
      title: "需求列表",
      prompt: "请从文档中提取所有功能需求和非功能需求，按优先级和模块整理成结构化列表。",
    },
    {
      id: "doc-analysis-risks",
      title: "风险与行动项",
      prompt: "请基于文档内容识别潜在的实现风险、依赖风险和时间风险，并给出建议的行动项和负责人（如可推断）。",
    },
  ],
  prompt_optimize: [
    {
      id: "prompt-optimize-default",
      title: "结构化优化",
      prompt: "请把下面的提示词优化成结构清晰、约束明确、输出格式稳定的版本。",
    },
    {
      id: "prompt-optimize-role",
      title: "加入角色",
      prompt: "请为以下场景设计一个专家角色（背景、立场、擅长领域、回答风格），并把现有提示词改写为带角色扮演的版本。",
    },
  ],
};

export function getTemplatesForTask(taskId: string): PromptTemplate[] {
  return TEMPLATES[taskId] ?? [];
}
