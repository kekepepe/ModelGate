"use client";

export type PromptTemplate = {
  id: string;
  title: string;
  prompt: string;
  taskId: string;
  builtin: boolean;
  recommendedParams?: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
};

type StoredShape = {
  version: 1;
  templates: PromptTemplate[];
};

const STORAGE_KEY = "modelgate:prompt-templates";
const BACKUP_KEY = "modelgate:prompt-templates.bak";

const BUILTIN: Omit<PromptTemplate, "createdAt" | "updatedAt" | "builtin">[] = [
  { id: "chat-help", title: "寻求帮助", taskId: "chat", prompt: "请用简洁准确的方式回答我的问题，并在必要时给出步骤和示例。" },
  { id: "chat-compare", title: "方案对比", taskId: "chat", prompt: "请帮我对比下面这些方案的优缺点，给出推荐和理由：\n- 方案 A：...\n- 方案 B：..." },
  { id: "chat-summarize", title: "要点总结", taskId: "chat", prompt: "请把下面这段内容总结成 3 条要点，每条不超过 30 个字：\n\n<粘贴文本>" },
  { id: "coding-feature", title: "实现功能", taskId: "coding", prompt: "请用 TypeScript 实现一个带输入校验、错误处理和单元测试的 API client。" },
  { id: "coding-refactor", title: "重构模块", taskId: "coding", prompt: "请把以下代码重构为单一职责，保留外部行为不变，并说明每一处改动的原因：\n\n```ts\n// 粘贴代码\n```" },
  { id: "coding-bug", title: "排查 Bug", taskId: "coding", prompt: "以下代码在生产环境偶发崩溃，请分析最可能的原因并给出修复：\n\n```ts\n// 粘贴代码\n```\n\n报错信息：\n<粘贴错误>" },
  { id: "code-review-default", title: "综合审查", taskId: "code_review", prompt: "请审查这段代码的可靠性、安全性和可维护性，并给出可执行的修改建议。" },
  { id: "code-review-security", title: "安全审查", taskId: "code_review", prompt: "请从安全角度审查以下代码，重点关注注入、权限、敏感信息泄露、输入校验和重放风险：\n\n```ts\n// 粘贴代码\n```" },
  { id: "doc-analysis-default", title: "需求大纲", taskId: "document_analysis", prompt: "请基于上传的需求文档，生成一份系统设计方案大纲，包括架构图（Mermaid）、核心模块说明、技术栈建议和接口定义。" },
  { id: "doc-analysis-requirements", title: "需求列表", taskId: "document_analysis", prompt: "请从文档中提取所有功能需求和非功能需求，按优先级和模块整理成结构化列表。" },
  { id: "doc-analysis-risks", title: "风险与行动项", taskId: "document_analysis", prompt: "请基于文档内容识别潜在的实现风险、依赖风险和时间风险，并给出建议的行动项和负责人（如可推断）。" },
  { id: "prompt-optimize-default", title: "结构化优化", taskId: "prompt_optimize", prompt: "请把下面的提示词优化成结构清晰、约束明确、输出格式稳定的版本。" },
  { id: "prompt-optimize-role", title: "加入角色", taskId: "prompt_optimize", prompt: "请为以下场景设计一个专家角色（背景、立场、擅长领域、回答风格），并把现有提示词改写为带角色扮演的版本。" },
];

const BUILTIN_EPOCH = "1970-01-01T00:00:00.000Z";

function builtinTemplates(): PromptTemplate[] {
  return BUILTIN.map((t) => ({
    ...t,
    builtin: true,
    createdAt: BUILTIN_EPOCH,
    updatedAt: BUILTIN_EPOCH,
  }));
}

function readUserTemplates(): PromptTemplate[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 1 || !Array.isArray(parsed.templates)) {
      throw new Error("schema_mismatch");
    }
    return parsed.templates.filter((t) => !t.builtin);
  } catch (err) {
    console.warn("[prompt-templates] corrupted localStorage, restoring builtin only", err);
    window.localStorage.setItem(BACKUP_KEY, raw);
    window.localStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function writeUserTemplates(templates: PromptTemplate[]) {
  if (typeof window === "undefined") return;
  const payload: StoredShape = {
    version: 1,
    templates: templates.filter((t) => !t.builtin),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function getAllTemplates(): PromptTemplate[] {
  return [...builtinTemplates(), ...readUserTemplates()];
}

export function getTemplatesForTask(taskId: string): PromptTemplate[] {
  return getAllTemplates().filter((t) => t.taskId === taskId);
}

export function getBuiltinTemplatesForTask(taskId: string): PromptTemplate[] {
  return builtinTemplates().filter((t) => t.taskId === taskId);
}

export function getUserTemplatesForTask(taskId: string): PromptTemplate[] {
  return readUserTemplates().filter((t) => t.taskId === taskId);
}

export type SaveTemplateInput = {
  title: string;
  taskId: string;
  prompt: string;
  recommendedParams?: Record<string, string | number | boolean>;
};

export type SaveResult =
  | { ok: true; template: PromptTemplate }
  | { ok: false; error: "duplicate_name" | "invalid_title" | "invalid_prompt" };

export function saveUserTemplate(input: SaveTemplateInput): SaveResult {
  const title = input.title.trim();
  if (title.length === 0 || title.length > 60) return { ok: false, error: "invalid_title" };
  if (input.prompt.length === 0 || input.prompt.length > 32000) return { ok: false, error: "invalid_prompt" };

  const existing = readUserTemplates();
  if (existing.some((t) => t.taskId === input.taskId && t.title === title)) {
    return { ok: false, error: "duplicate_name" };
  }

  const now = new Date().toISOString();
  const template: PromptTemplate = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}`,
    title,
    taskId: input.taskId,
    prompt: input.prompt,
    recommendedParams: input.recommendedParams,
    builtin: false,
    createdAt: now,
    updatedAt: now,
  };
  writeUserTemplates([...existing, template]);
  return { ok: true, template };
}

export function deleteUserTemplate(id: string): boolean {
  const existing = readUserTemplates();
  const next = existing.filter((t) => t.id !== id);
  if (next.length === existing.length) return false;
  writeUserTemplates(next);
  return true;
}

export function exportUserTemplates(): string {
  const payload: StoredShape = {
    version: 1,
    templates: readUserTemplates(),
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportResult = {
  added: number;
  skipped: number;
  errors: string[];
};

export function importUserTemplates(json: string, mode: "skip" | "overwrite"): ImportResult {
  const result: ImportResult = { added: 0, skipped: 0, errors: [] };
  let parsed: StoredShape;
  try {
    parsed = JSON.parse(json) as StoredShape;
  } catch {
    result.errors.push("invalid_json");
    return result;
  }
  if (parsed.version !== 1 || !Array.isArray(parsed.templates)) {
    result.errors.push("schema_mismatch");
    return result;
  }

  const existing = readUserTemplates();
  const byKey = new Map<string, PromptTemplate>(existing.map((t) => [`${t.taskId}::${t.title}`, t]));

  for (const incoming of parsed.templates) {
    if (incoming.builtin) {
      result.skipped += 1;
      continue;
    }
    if (
      typeof incoming.title !== "string" ||
      typeof incoming.prompt !== "string" ||
      typeof incoming.taskId !== "string"
    ) {
      result.errors.push(`invalid_template:${incoming.id ?? "?"}`);
      continue;
    }
    const key = `${incoming.taskId}::${incoming.title}`;
    const now = new Date().toISOString();
    const normalized: PromptTemplate = {
      id: incoming.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `t-${Date.now()}-${result.added}`),
      title: incoming.title,
      taskId: incoming.taskId,
      prompt: incoming.prompt,
      recommendedParams: incoming.recommendedParams,
      builtin: false,
      createdAt: incoming.createdAt || now,
      updatedAt: now,
    };
    if (byKey.has(key)) {
      if (mode === "skip") {
        result.skipped += 1;
        continue;
      }
      byKey.set(key, normalized);
    } else {
      byKey.set(key, normalized);
    }
    result.added += 1;
  }

  writeUserTemplates(Array.from(byKey.values()));
  return result;
}
