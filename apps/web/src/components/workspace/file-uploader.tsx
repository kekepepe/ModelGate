"use client";

import { Trash2, Upload } from "lucide-react";
import { useRef } from "react";

import { API_BASE_URL } from "@/lib/api";
import type { FileRecord } from "@/types/model";

type FileUploaderProps = {
  files: FileRecord[];
  uploading: boolean;
  onUpload: (file: File) => void;
  onDelete: (fileId: string) => void;
};

export function FileUploader({ files, uploading, onUpload, onDelete }: FileUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:border-slate-500"
        title="上传文件"
      >
        <Upload className="h-4 w-4" aria-hidden="true" />
        {uploading ? "上传中" : "上传"}
      </button>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onUpload(file);
          event.currentTarget.value = "";
        }}
      />

      <div className="space-y-2">
        {files.map((file) => (
          <div key={file.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 p-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{file.originalName}</div>
              <div className="text-xs text-slate-500">
                {file.detectedType} / {(file.sizeBytes / 1024).toFixed(1)} KB
              </div>
              {file.detectedType === "image" ? (
                <img
                  src={`${API_BASE_URL}/files/${file.id}/preview`}
                  alt={file.originalName}
                  className="mt-2 h-16 w-24 rounded border border-slate-200 object-cover"
                />
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDelete(file.id)}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600"
              title="删除文件"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
