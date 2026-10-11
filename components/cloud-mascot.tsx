"use client";

import { cn } from "@zmzai/theme";

import "./cloud-mascot.css";

/** 墨黑小云（ZMZ 吉祥物）：陪伴 / 思考 / 等待 / 完成 / 错误 五态。
 *  基于品牌云 Logo 的轮廓与右上两颗圆点；小实心眼睛，无高光大眼。
 *  动画与真实运行状态绑定，状态本身另有文字说明（本组件是辅助表达）。
 *  prefers-reduced-motion 时不播放位移/循环动画，仅保留静态状态差异。 */

export type CloudMascotState = "companion" | "thinking" | "complete" | "waiting" | "error";

export function CloudMascot({ state, size = 96, className }: { state: CloudMascotState; size?: number; className?: string }) {
  return (
    <span
      data-cloud-state={state}
      className={cn("relative inline-block text-ink", state === "companion" && "zmz-cloud-float", state === "complete" && "zmz-cloud-complete-lift", className)}
      style={{ width: size, height: (size * 170) / 230 }}
      role="img"
      aria-label={state === "waiting" ? "小云等你确认" : state === "error" ? "小云遇到了问题" : state === "thinking" ? "小云正在思考" : state === "complete" ? "小云完成了任务" : "小云陪伴中"}
    >
      <svg viewBox="0 0 230 170" width={size} height={(size * 170) / 230} className="overflow-visible">
        {/* 云身：墨黑线条 + 白色主体 */}
        <path
          className="zmz-cloud-body"
          d="M48 146 Q22 138 23 105 Q24 80 48 72 Q54 70 61 71 Q75 38 106 40 Q138 40 145 78 Q166 68 188 82 Q212 98 207 123 Q203 151 173 153 L147 150 Q133 133 116 136 Q99 138 96 155 Q70 158 48 146Z"
          fill="var(--paper, #fff)"
          stroke="currentColor"
          strokeWidth={5}
          strokeLinejoin="round"
        />
        {/* 右下交叠（Logo 结构特征） */}
        <path
          d="M96 154 Q94 130 118 124 Q140 120 147 143 Q151 158 137 163 Q125 166 128 148 Q131 141 137 143"
          fill="none"
          stroke="currentColor"
          strokeWidth={4}
          strokeLinecap="round"
        />

        {/* 眼睛：陪伴（原位） / 思考（上移+抬眉） / 完成（笑眼） */}
        <g className="zmz-cloud-eyes zmz-cloud-eyes-companion">
          <circle cx={81} cy={109} r={4.8} fill="currentColor" />
          <circle cx={122} cy={109} r={4.8} fill="currentColor" />
        </g>
        <g className="zmz-cloud-eyes zmz-cloud-eyes-error">
          <path d="M73 99 L89 104 M114 104 L130 99" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <circle cx={81} cy={113} r={4.5} fill="currentColor" /><circle cx={122} cy={113} r={4.5} fill="currentColor" />
        </g>
        <g className="zmz-cloud-eyes zmz-cloud-eyes-thinking">
          <path d="M72 98 Q81 92 90 97" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <path d="M113 97 Q122 91 131 96" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
          <circle cx={84} cy={105} r={4.5} fill="currentColor" />
          <circle cx={125} cy={104} r={4.5} fill="currentColor" />
        </g>
        <g className="zmz-cloud-eyes zmz-cloud-eyes-complete">
          <path d="M73 108 Q81 101 89 108" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M114 108 Q122 101 130 108" fill="none" stroke="currentColor" strokeWidth={3.4} strokeLinecap="round" />
          <path d="M93 121 Q101 128 110 121" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" />
        </g>

        {/* 右上两颗圆点：陪伴/完成可见；思考时收起，同位置变成小问号 */}
        <g className="zmz-cloud-dots">
          <circle cx={158} cy={37} r={11} fill="currentColor" />
          <circle cx={193} cy={49} r={7} fill="currentColor" />
        </g>
        <g className="zmz-cloud-question" fill="none" stroke="currentColor" strokeWidth={4.4} strokeLinecap="round">
          <path d="M167 27 C167 17 181 15 186 23 C191 32 182 36 177 41 L177 44" />
          <circle cx={177} cy={52} r={2.6} fill="currentColor" stroke="none" />
        </g>
      </svg>
    </span>
  );
}
