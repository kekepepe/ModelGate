"use client";

import { Copy, Download, RotateCcw } from "lucide-react";

import type { RunRecord } from "@/types/model";

type ResultPanelProps = {
  run: RunRecord | null;
  history: RunRecord[];
  onRerun: (run: RunRecord) => void;
};

export function ResultPanel({ run, history, onRerun }: ResultPanelProps) {
  const downloadText = () => {
    const text = run?.output?.text ?? "";
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${run?.id ?? "modelgate-result"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-sm font-semibold text-slate-900">结果</h2>
        <div className="mt-3 min-h-48 rounded-md border border-slate-200 bg-white p-3 text-sm">
          {run?.output ? (
            <div className="space-y-3">
              <ResultContent run={run} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    navigator.clipboard.writeText(
                      run.output?.text ?? JSON.stringify(run.output, null, 2),
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  title="复制结果"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  复制结果
                </button>
                <button
                  type="button"
                  onClick={downloadText}
                  className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-1.5 text-xs"
                  title="下载结果"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  下载
                </button>
              </div>
            </div>
          ) : (
            <p className="text-slate-500">运行结果将在这里展示。</p>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-900">历史</h2>
        <div className="mt-3 space-y-2">
          {history.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-md border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium">{item.id}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.status}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      navigator.clipboard.writeText(JSON.stringify(item.params, null, 2))
                    }
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                    title="复制参数"
                  >
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRerun(item)}
                    className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
                    title="重新运行"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function ResultContent({ run }: { run: RunRecord }) {
  const output = run.output;
  if (!output) return null;
  if (output.imageUrl) {
    return (
      <img
        src={output.imageUrl}
        alt="生成结果"
        className="max-h-80 rounded-md border border-slate-200 object-contain"
      />
    );
  }
  if (output.videoUrl) {
    return (
      <video
        src={output.videoUrl}
        controls
        className="max-h-80 w-full rounded-md border border-slate-200"
      />
    );
  }
  if (output.fileUrl) {
    return (
      <a
        href={output.fileUrl}
        download
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {output.fileName ?? "下载文件"}
      </a>
    );
  }
  return (
    <p className="whitespace-pre-wrap text-slate-800">
      {output.text ?? JSON.stringify(output, null, 2)}
    </p>
  );
}
