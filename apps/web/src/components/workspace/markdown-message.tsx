"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

import { CodeBlock } from "./code-block";

const ReactMarkdown = dynamic(() => import("react-markdown"), {
  ssr: false,
  loading: () => null,
});

type Props = {
  content: string;
  className?: string;
};

const remarkPluginsLoader = () => import("remark-gfm").then((m) => [m.default]);

let cachedRemarkPlugins: unknown[] | null = null;

function useRemarkPlugins() {
  if (cachedRemarkPlugins) return cachedRemarkPlugins;
  remarkPluginsLoader().then((plugins) => {
    cachedRemarkPlugins = plugins;
  });
  return cachedRemarkPlugins ?? [];
}

type CodeProps = ComponentProps<"code"> & { inline?: boolean };

export function MarkdownMessage({ content, className }: Props) {
  const plugins = useRemarkPlugins();

  if (!content) return null;

  return (
    <div className={cn("prose prose-sm max-w-none break-words text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={plugins as never}
        components={{
          code: ({ inline, className: codeClassName, children, ...rest }: CodeProps) => {
            const match = /language-(\w+)/.exec(codeClassName ?? "");
            const value = String(children ?? "").replace(/\n$/, "");
            if (inline || !match) {
              return (
                <code
                  className={cn(
                    "rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono",
                    codeClassName,
                  )}
                  {...rest}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match[1]} value={value} />;
          },
          a: ({ className: linkClassName, ...rest }) => (
            <a
              {...rest}
              className={cn("text-primary underline hover:opacity-80", linkClassName)}
              target="_blank"
              rel="noopener noreferrer"
            />
          ),
          table: ({ className: tableClassName, ...rest }) => (
            <div className="my-2 overflow-x-auto">
              <table
                {...rest}
                className={cn("min-w-full border-collapse text-xs", tableClassName)}
              />
            </div>
          ),
          th: ({ className: thClassName, ...rest }) => (
            <th {...rest} className={cn("border bg-muted/50 px-2 py-1 text-left", thClassName)} />
          ),
          td: ({ className: tdClassName, ...rest }) => (
            <td {...rest} className={cn("border px-2 py-1 align-top", tdClassName)} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
