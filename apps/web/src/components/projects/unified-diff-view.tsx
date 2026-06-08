"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface UnifiedDiffViewProps {
  diff: string;
  highRiskFiles?: Array<{ file: string; reason: string }>;
}

interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ type: "add" | "del" | "context"; content: string }>;
}

interface DiffFile {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
  isHighRisk: boolean;
  riskReason?: string;
}

function parseDiff(diffText: string, highRiskFiles: Array<{ file: string; reason: string }> = []): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = diffText.split("\n");
  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  const highRiskMap = new Map(highRiskFiles.map((hr) => [hr.file, hr.reason]));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file header: --- a/path
    if (line.startsWith("--- ")) {
      const path = line.replace(/^--- [ab]\//, "");
      // Start a new file block
      currentFile = {
        oldPath: path === "/dev/null" ? "/dev/null" : path,
        newPath: "",
        hunks: [],
        isHighRisk: highRiskMap.has(path),
        riskReason: highRiskMap.get(path),
      };
      currentHunk = null;
      continue;
    }

    // New file header: +++ b/path
    if (line.startsWith("+++ ") && currentFile) {
      const path = line.replace(/^\+\+\+ [ab]\//, "");
      currentFile.newPath = path === "/dev/null" ? "/dev/null" : path;
      // Check high-risk on new path too
      if (highRiskMap.has(path)) {
        currentFile.isHighRisk = true;
        currentFile.riskReason = highRiskMap.get(path);
      }
      files.push(currentFile);
      continue;
    }

    // Hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
    if (hunkMatch && currentFile) {
      currentHunk = {
        header: line,
        oldStart: parseInt(hunkMatch[1]),
        oldCount: parseInt(hunkMatch[2] || "1"),
        newStart: parseInt(hunkMatch[3]),
        newCount: parseInt(hunkMatch[4] || "1"),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      continue;
    }

    // Diff content lines
    if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ type: "add", content: line.slice(1) });
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ type: "del", content: line.slice(1) });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({ type: "context", content: line.startsWith(" ") ? line.slice(1) : "" });
      }
    }
  }

  return files;
}

function FileDiff({
  file,
  defaultExpanded = true,
}: {
  file: DiffFile;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const addCount = file.hunks.reduce(
    (sum, h) => sum + h.lines.filter((l) => l.type === "add").length,
    0
  );
  const delCount = file.hunks.reduce(
    (sum, h) => sum + h.lines.filter((l) => l.type === "del").length,
    0
  );

  const displayPath = file.newPath === "/dev/null" ? file.oldPath : file.newPath;

  return (
    <div className="border rounded-md overflow-hidden mb-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted/70 text-left text-xs font-mono"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="truncate flex-1">{displayPath}</span>
        {file.isHighRisk && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 shrink-0">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>High risk</span>
          </span>
        )}
        <span className="text-green-600 dark:text-green-400 shrink-0">+{addCount}</span>
        <span className="text-red-600 dark:text-red-400 shrink-0">-{delCount}</span>
      </button>

      {expanded && (
        <div className="text-xs font-mono">
          {file.isHighRisk && file.riskReason && (
            <div className="px-3 py-1.5 bg-amber-50 dark:bg-amber-950/30 border-b text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {file.riskReason}
            </div>
          )}
          {file.hunks.map((hunk, hi) => (
            <div key={hi}>
              <div className="px-3 py-1 bg-blue-50/50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-b border-t">
                {hunk.header}
              </div>
              {hunk.lines.map((line, li) => (
                <div
                  key={li}
                  className={`flex px-3 ${
                    line.type === "add"
                      ? "bg-green-50 dark:bg-green-950/30"
                      : line.type === "del"
                        ? "bg-red-50 dark:bg-red-950/30"
                        : ""
                  }`}
                >
                  <span className="w-8 text-right pr-2 text-muted-foreground/50 shrink-0 select-none">
                    {line.type === "del" ? hunk.oldStart + li : ""}
                  </span>
                  <span className="w-8 text-right pr-2 text-muted-foreground/50 shrink-0 select-none">
                    {line.type === "add" ? hunk.newStart + li : ""}
                  </span>
                  <span className="w-4 text-center shrink-0 select-none">
                    {line.type === "add" ? (
                      <span className="text-green-600 dark:text-green-400">+</span>
                    ) : line.type === "del" ? (
                      <span className="text-red-600 dark:text-red-400">-</span>
                    ) : (
                      <span className="text-muted-foreground/30"> </span>
                    )}
                  </span>
                  <span className="flex-1 whitespace-pre overflow-x-auto">
                    {line.content}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function UnifiedDiffView({ diff, highRiskFiles = [] }: UnifiedDiffViewProps) {
  const files = parseDiff(diff, highRiskFiles);

  if (files.length === 0) {
    return (
      <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed p-3 rounded-md border bg-muted/30">
        {diff}
      </pre>
    );
  }

  return (
    <div className="space-y-1">
      {files.map((file, i) => (
        <FileDiff key={`${file.newPath}-${i}`} file={file} />
      ))}
    </div>
  );
}
