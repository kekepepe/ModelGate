"use client";

import { useRef } from "react";
import { Plus, Send, X, XCircle, AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FileRecord } from "@/types/model";

type Props = {
  prompt: string;
  onPromptChange: (next: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  canSend: boolean;
  files: FileRecord[];
  onUpload: (file: File) => void;
  onRemoveFile: (fileId: string) => void;
  uploadError?: string | null;
  paramsSlot?: React.ReactNode;
  modelSlot?: React.ReactNode;
  extraActionsSlot?: React.ReactNode;
};

export function Composer({
  prompt,
  onPromptChange,
  onSend,
  onStop,
  isStreaming,
  canSend,
  files,
  onUpload,
  onRemoveFile,
  uploadError,
  paramsSlot,
  modelSlot,
  extraActionsSlot,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend && !isStreaming) onSend();
    }
  };

  return (
    <div className="border-t bg-card" data-testid="chat-composer">
      {modelSlot ? <div className="border-b">{modelSlot}</div> : null}

      <div className="px-4 pt-3">
        {files.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-1.5 rounded-md border bg-muted/50 py-1 pl-2 pr-1 text-xs"
              >
                <FileChipIcon file={file} />
                <span className="max-w-[180px] truncate">{file.originalName}</span>
                <span className="text-muted-foreground">{formatBytes(file.sizeBytes)}</span>
                <button
                  type="button"
                  onClick={() => onRemoveFile(file.id)}
                  className="ml-0.5 rounded p-0.5 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${file.originalName}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {uploadError ? (
          <div className="mb-2 flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            {uploadError}
          </div>
        ) : null}

        <Textarea
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[88px] resize-y border-0 px-0 py-1 text-sm leading-relaxed shadow-none focus-visible:ring-0"
          placeholder="Message the model… (Enter to send, Shift+Enter for newline)"
          maxLength={4000}
          data-testid="chat-composer-textarea"
        />
        <div className="text-right text-[10px] text-muted-foreground">{prompt.length} / 4000</div>
      </div>

      <div className="flex items-center justify-between border-t px-3 py-2">
        <TooltipProvider delayDuration={300}>
          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="chat-composer-upload"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Upload file</TooltipContent>
            </Tooltip>
            {paramsSlot}
            {extraActionsSlot}
          </div>
        </TooltipProvider>

        <div className="flex items-center gap-2">
          {isStreaming ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStop}
              data-testid="chat-composer-stop"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" disabled={!canSend} onClick={onSend} data-testid="chat-composer-send">
              <Send className="mr-1 h-3.5 w-3.5" />
              Send
            </Button>
          )}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
          e.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function FileChipIcon({ file }: { file: FileRecord }) {
  const type = file.detectedType;
  if (type === "image") return <span className="text-xs">🖼</span>;
  if (type === "video") return <span className="text-xs">🎬</span>;
  if (type === "audio") return <span className="text-xs">🎵</span>;
  if (type === "code") return <span className="text-xs">📄</span>;
  return <span className="text-xs">📎</span>;
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
