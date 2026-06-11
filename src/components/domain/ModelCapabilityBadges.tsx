import type { RemoteModel } from "../../types";
import { getModelCapabilityTags, getModelDisplayModalityFlow, type ModelCapabilityTag } from "../../utils/modelCapabilities";
import { BoltIcon, BranchIcon, FileIcon, GlobeIcon, ImageIcon, TextIcon, VisionIcon } from "../ui/UiIcons";

const capabilityMeta: Record<ModelCapabilityTag, { label: string; Icon: () => JSX.Element }> = {
  vision: { label: "Vision", Icon: () => <VisionIcon size={12} /> },
  reasoning: { label: "Reasoning", Icon: () => <BoltIcon size={12} /> },
  function: { label: "Tools", Icon: () => <BranchIcon size={12} /> },
  web: { label: "Web", Icon: () => <GlobeIcon size={12} /> },
  image: { label: "Image", Icon: () => <ImageIcon size={12} /> },
};

const modalityMeta: Record<string, { label: string; Icon: () => JSX.Element }> = {
  text: { label: "Text", Icon: () => <TextIcon size={12} /> },
  image: { label: "Image", Icon: () => <ImageIcon size={12} /> },
  audio: { label: "Audio", Icon: () => <span className="model-capability-glyph">A</span> },
  video: { label: "Video", Icon: () => <span className="model-capability-glyph">V</span> },
  file: { label: "File", Icon: () => <FileIcon size={12} /> },
  unknown: { label: "Unknown", Icon: () => <span className="model-capability-glyph">?</span> },
};

function modalityLabel(modality: string): string {
  return modalityMeta[modality]?.label ?? modality.replace(/_/g, " ");
}

function ModalityChip({ modality }: { modality: string }) {
  const meta = modalityMeta[modality];
  const Icon = meta?.Icon;
  const label = modalityLabel(modality);
  return (
    <span className={`model-modality-chip model-modality-${modality}`} title={label}>
      {Icon ? <Icon /> : <span className="model-capability-glyph">{label.charAt(0).toUpperCase()}</span>}
    </span>
  );
}

export function ModelCapabilityBadges({ model }: { model: RemoteModel }) {
  const flow = getModelDisplayModalityFlow(model);
  if (flow) {
    return (
      <span className="model-capability-row model-modality-row" title={`${flow.input.map(modalityLabel).join(", ")} -> ${flow.output.map(modalityLabel).join(", ")}`}>
        {flow.input.map((modality) => (
          <ModalityChip key={`in-${modality}`} modality={modality} />
        ))}
        <span className="model-modality-arrow">→</span>
        {flow.output.map((modality) => (
          <ModalityChip key={`out-${modality}`} modality={modality} />
        ))}
      </span>
    );
  }

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
