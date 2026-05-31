import type { RemoteModel } from "../types";
import { getModelCapabilityTags, type ModelCapabilityTag } from "../utils/modelCapabilities";
import { BoltIcon, BranchIcon, GlobeIcon, ImageIcon, VisionIcon } from "./UiIcons";

const capabilityMeta: Record<ModelCapabilityTag, { label: string; Icon: () => JSX.Element }> = {
  vision: { label: "Vision", Icon: () => <VisionIcon size={12} /> },
  reasoning: { label: "Reasoning", Icon: () => <BoltIcon size={12} /> },
  function: { label: "Tools", Icon: () => <BranchIcon size={12} /> },
  web: { label: "Web", Icon: () => <GlobeIcon size={12} /> },
  image: { label: "Image", Icon: () => <ImageIcon size={12} /> },
};

export function ModelCapabilityBadges({ model }: { model: RemoteModel }) {
  const tags = getModelCapabilityTags(model);
  if (!tags.length) return null;
  return (
    <span className="model-capability-row">
      {tags.map((tag) => {
        const { label, Icon } = capabilityMeta[tag];
        return (
          <span className={`model-capability-tag model-capability-${tag}`} key={tag} title={label}>
            <Icon />
            <span>{label}</span>
          </span>
        );
      })}
    </span>
  );
}
