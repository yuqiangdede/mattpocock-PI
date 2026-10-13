/** A UI image-prompt authoring action. This does not generate an image or modify code. */
export const INTERACTION_IMAGE_PROMPT_ID = "interaction-image-prompt";

export function interactionImagePrompt(language: string): string {
  if (language.startsWith("zh")) return [
    "请根据当前对话中已确认的需求、交互设计、附件截图和可获取的项目文档，整理可直接用于图像生成模型的高保真业务系统 UI 效果图提示词。本次只生成提示词，不生成图片、不编写代码、不修改项目文件。",
    "首先提炼目标用户、业务流程、现有页面结构、功能组件、操作入口、关键状态及明确的禁止修改项；以最新确认的决策为准，不确定且影响核心交互的地方先询问，其余视觉细节合理补全并标明假设。",
    "有参考截图时，以原页面为基础做增量设计，保持未涉及区域的结构、颜色和控件风格；不要凭空新增业务功能。静态图必须体现真实操作后的一个关键状态，必要时分别给出初始、弹窗、操作结果等状态图提示词。",
    "输出格式：①交互设计摘要（布局和主要操作）；②完整可复制的中文生图提示词（分区、位置、文案、组件、状态和视觉约束，独立于原始对话）；③按需给出其他关键状态的完整提示词；④保留与禁止修改项、尚未确认问题。",
    "默认使用桌面端 16:9 高保真界面截图风格，有参考图则优先维持其比例。界面清晰务实，使用准确的中文业务标签，不做概念海报或花哨装饰。若早期对话内容不可获取，要明确指出，不得声称已经读取。",
  ].join("\n");
  return [
    "Using the confirmed requirements, UI discussion, attached screenshots, and accessible project documents in the current conversation, write a production-style UI image-generation prompt. Output prompts only: do not generate images, change code, or edit project files.",
    "Identify users, business flows, layout, controls, actions, states and constraints. Follow the newest confirmed decisions, ask only about critical ambiguities, and flag assumptions. For reference screenshots, preserve untouched areas and visual style; do not invent features.",
    "Output: (1) concise interaction-design summary, (2) a complete standalone image-generation prompt detailing layout, positions, Chinese UI labels, components and visible state, (3) separate self-contained prompts for other key states when needed, (4) constraints and open questions.",
    "Default to a clean, high-fidelity 16:9 desktop business application screenshot; preserve a supplied reference image's ratio. Do not fabricate access to earlier context or try to depict multiple sequential interactions in one static state.",
  ].join("\n");
}
