"use client";

import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { Streamdown } from "streamdown";
import { ChartBlock } from "./chart-block";

const plugins = { code, mermaid, renderers: [{ language: "chart", component: ChartBlock }] };

export function Markdown({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <Streamdown plugins={plugins} isAnimating={streaming} className="text-sm leading-relaxed [&_table]:text-xs">
      {text}
    </Streamdown>
  );
}
