import AIAsset from "./AIAsset.js";
import { generateAiImage } from "../executors/aiProvider.js";

export async function generateBrandedImageAsset({ agent, task, prompt, createdBy }) {
  const brandedPrompt = [
    "Create a premium modern B2B SaaS visual for OTO Dial.",
    "Style: clean telecom/business aesthetic, dark navy/indigo/cyan palette, high-trust enterprise composition.",
    "Avoid generic AI art, clutter, distorted text, spammy meme style, or unrealistic phone imagery.",
    `Creative brief: ${prompt}`,
  ].join("\n");

  const image = await generateAiImage({ prompt: brandedPrompt });
  return AIAsset.create({
    agent: agent._id,
    task: task?._id || null,
    type: "ad_creative",
    title: task?.title ? `${task.title} creative` : "OTO Agents generated creative",
    content: {
      prompt: brandedPrompt,
      provider: image.provider,
      model: image.model,
      image,
    },
    status: "awaiting_approval",
    createdBy,
  });
}
