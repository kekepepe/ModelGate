import Link from "next/link";

const tasks = [
  { id: "chat", name: "聊天", input: "text", output: "text" },
  { id: "coding", name: "写代码", input: "text/code", output: "text" },
  { id: "code_review", name: "代码审查", input: "code", output: "text" },
  { id: "document_analysis", name: "文档分析", input: "file", output: "text" },
  { id: "prompt_optimize", name: "Prompt 优化", input: "text", output: "text" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background p-8">
      <section className="mx-auto max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold">ModelGate</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            本地单用户多模型工作台。第一版优先支持 MiMo、MiniMax 和火山 Coding Plan 的 Chat / Coding 类任务。
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <Link
              key={task.id}
              href={`/workspace?taskType=${task.id}`}
              className="rounded-md border border-slate-200 bg-white p-4 transition hover:border-slate-400"
            >
              <div className="text-base font-medium">{task.name}</div>
              <div className="mt-3 text-xs text-slate-500">
                输入：{task.input} / 输出：{task.output}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

