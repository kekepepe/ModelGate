"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  WandSparkles,
  Save,
  Settings2,
  Trash2,
  Download,
  Upload as UploadIcon,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type PromptTemplate,
  getBuiltinTemplatesForTask,
  getUserTemplatesForTask,
  saveUserTemplate,
  deleteUserTemplate,
  exportUserTemplates,
  importUserTemplates,
} from "@/lib/prompt-templates";

type Props = {
  taskId: string;
  currentPrompt: string;
  currentParams: Record<string, string | number | boolean>;
  onSelect: (template: PromptTemplate) => void;
};

export function PromptTemplatePopover({ taskId, currentPrompt, currentParams, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSave, setShowSave] = useState(false);
  const [showManage, setShowManage] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const builtins = useMemo(() => getBuiltinTemplatesForTask(taskId), [taskId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const userTemplates = useMemo(() => getUserTemplatesForTask(taskId), [taskId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const refresh = () => setRefreshKey((v) => v + 1);

  return (
    <>
      <div ref={containerRef} className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => setOpen((value) => !value)}
          title="Select prompt template"
        >
          <WandSparkles className="mr-1 h-3.5 w-3.5" />
          Templates
        </Button>
        {open ? (
          <div className="absolute right-0 z-30 mt-1 w-80 rounded-md border bg-popover p-1 shadow-lg">
            {builtins.length > 0 ? (
              <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Builtin
              </div>
            ) : null}
            {builtins.map((template) => (
              <TemplateRow
                key={template.id}
                template={template}
                onClick={() => {
                  onSelect(template);
                  setOpen(false);
                }}
              />
            ))}

            <div className="px-2 pt-2 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Saved
            </div>
            {userTemplates.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No saved templates yet.</div>
            ) : (
              userTemplates.map((template) => (
                <TemplateRow
                  key={template.id}
                  template={template}
                  onClick={() => {
                    onSelect(template);
                    setOpen(false);
                  }}
                />
              ))
            )}

            <div className="my-1 border-t" />
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent"
              onClick={() => {
                setOpen(false);
                setShowSave(true);
              }}
              disabled={currentPrompt.trim().length === 0}
            >
              <Save className="h-3.5 w-3.5" />
              Save current as template
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-xs hover:bg-accent"
              onClick={() => {
                setOpen(false);
                setShowManage(true);
              }}
            >
              <Settings2 className="h-3.5 w-3.5" />
              Manage templates
            </button>
          </div>
        ) : null}
      </div>

      {showSave ? (
        <SaveTemplateModal
          taskId={taskId}
          currentPrompt={currentPrompt}
          currentParams={currentParams}
          onClose={() => setShowSave(false)}
          onSaved={() => {
            refresh();
            setShowSave(false);
          }}
        />
      ) : null}

      {showManage ? (
        <ManageTemplatesModal onClose={() => setShowManage(false)} onChanged={refresh} />
      ) : null}
    </>
  );
}

function TemplateRow({ template, onClick }: { template: PromptTemplate; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded px-3 py-2 text-left text-xs hover:bg-accent"
      title={template.prompt}
    >
      <div className="font-medium">{template.title}</div>
      <div className="mt-0.5 line-clamp-2 text-muted-foreground">{template.prompt}</div>
    </button>
  );
}

/* ── Save modal ───────────────────────────────────────── */

function SaveTemplateModal({
  taskId,
  currentPrompt,
  currentParams,
  onClose,
  onSaved,
}: {
  taskId: string;
  currentPrompt: string;
  currentParams: Record<string, string | number | boolean>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [includeParams, setIncludeParams] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const result = saveUserTemplate({
      title,
      taskId,
      prompt: currentPrompt,
      recommendedParams: includeParams ? currentParams : undefined,
    });
    if (!result.ok) {
      if (result.error === "duplicate_name")
        setError("A saved template with this name already exists for this task.");
      else if (result.error === "invalid_title") setError("Name is required, max 60 characters.");
      else setError("Prompt is required, max 32000 characters.");
      return;
    }
    onSaved();
  };

  return (
    <ModalShell title="Save current as template" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={60}
            className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            placeholder="e.g. Slack triage prompt"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground">Task type</label>
          <div className="mt-1 rounded border bg-muted/40 px-2 py-1.5 font-mono text-xs">
            {taskId}
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={includeParams}
            onChange={(e) => setIncludeParams(e.target.checked)}
          />
          Include current params as recommended
        </label>
        {error ? <div className="text-xs text-destructive">{error}</div> : null}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button size="sm" onClick={submit}>
          Save
        </Button>
      </div>
    </ModalShell>
  );
}

/* ── Manage modal ─────────────────────────────────────── */

function ManageTemplatesModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [importMode, setImportMode] = useState<"skip" | "overwrite">("skip");
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const userTemplates = useMemo(() => {
    const ids = ["chat", "coding", "code_review", "document_analysis", "prompt_optimize"];
    return ids.flatMap((id) => getUserTemplatesForTask(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const refresh = () => {
    setRefreshKey((v) => v + 1);
    onChanged();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this saved template?")) return;
    if (deleteUserTemplate(id)) refresh();
  };

  const handleExport = () => {
    const json = exportUserTemplates();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelgate-templates-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const result = importUserTemplates(text, importMode);
    if (result.errors.length > 0) {
      setImportMessage(
        `Import had ${result.errors.length} error(s): ${result.errors.slice(0, 3).join(", ")}`,
      );
    } else {
      setImportMessage(`Imported ${result.added} template(s), skipped ${result.skipped}.`);
    }
    refresh();
  };

  return (
    <ModalShell title="Manage templates" onClose={onClose} wide>
      <div className="flex items-center justify-between border-b pb-3 text-xs">
        <div className="text-muted-foreground">
          Builtin templates are read-only. Only your saved templates appear here.
        </div>
        <div className="flex items-center gap-2">
          <select
            className="rounded border bg-background px-2 py-1 text-xs"
            value={importMode}
            onChange={(e) => setImportMode(e.target.value as "skip" | "overwrite")}
            title="Import conflict strategy"
          >
            <option value="skip">On conflict: skip</option>
            <option value="overwrite">On conflict: overwrite</option>
          </select>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handleImportFile(file);
              e.currentTarget.value = "";
            }}
          />
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon className="mr-1 h-3.5 w-3.5" /> Import JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export all
          </Button>
        </div>
      </div>

      {importMessage ? (
        <div className="mt-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          {importMessage}
        </div>
      ) : null}

      <div className="mt-3 max-h-[400px] overflow-y-auto">
        {userTemplates.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No saved templates. Use &ldquo;Save current as template&rdquo; in the Playground to
            create one.
          </div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Task</th>
                <th className="px-2 py-1.5">Prompt</th>
                <th className="px-2 py-1.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {userTemplates.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="px-2 py-2 font-medium">{t.title}</td>
                  <td className="px-2 py-2 font-mono text-[10px]">{t.taskId}</td>
                  <td className="px-2 py-2 text-muted-foreground line-clamp-2 max-w-[300px]">
                    {t.prompt}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(t.id)}
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </ModalShell>
  );
}

/* ── Modal shell ──────────────────────────────────────── */

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
      <div
        className={`relative w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-lg border bg-card p-5 shadow-xl`}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="pt-3">{children}</div>
      </div>
    </div>
  );
}
