import { useState } from "react";
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

const editableModalities = ["unknown", "text", "image", "audio", "video", "file"];

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

function normalizeSelection(values: string[]): string[] {
  return editableModalities.filter((modality) => values.includes(modality));
}

function toggleSelection(values: string[], modality: string): string[] {
  if (modality === "unknown") return values.includes("unknown") ? [] : ["unknown"];
  if (values.includes(modality)) return values.filter((value) => value !== modality);
  return [...values.filter((value) => value !== "unknown"), modality];
}

function canSaveSelection(input: string[], output: string[]): boolean {
  return Boolean(normalizeSelection(input).length && normalizeSelection(output).length);
}

function selectedModalities(values: string[]): string[] {
  const normalized = normalizeSelection(values);
  if (normalized.includes("unknown")) return ["unknown"];
  return normalized;
}

export function ModelCapabilityBadges({
  model,
  onManualMetadata,
}: {
  model: RemoteModel;
  onManualMetadata?: (model: RemoteModel) => void | Promise<void>;
}) {
  const flow = getModelDisplayModalityFlow(model);
  const isUnknownFlow = Boolean(
    flow
    && flow.input.every((modality) => modality === "unknown")
    && flow.output.every((modality) => modality === "unknown"),
  );
  const canEditManual = Boolean(
    onManualMetadata
    && flow
    && (isUnknownFlow || model.metadataSource === "manual"),
  );
  const [isEditing, setIsEditing] = useState(false);
  const [inputModalities, setInputModalities] = useState<string[]>(
    normalizeSelection(model.inputModalities ?? []).length
      ? normalizeSelection(model.inputModalities ?? [])
      : isUnknownFlow
        ? ["unknown"]
      : ["text"],
  );
  const [outputModalities, setOutputModalities] = useState<string[]>(
    normalizeSelection(model.outputModalities ?? []).length
      ? normalizeSelection(model.outputModalities ?? [])
      : isUnknownFlow
        ? ["unknown"]
      : ["text"],
  );
  const [isSaving, setIsSaving] = useState(false);

  const saveManualMetadata = async () => {
    if (!onManualMetadata || isSaving) return;
    const input = selectedModalities(inputModalities);
    const output = selectedModalities(outputModalities);
    if (!input.length || !output.length) return;
    setIsSaving(true);
    try {
      await onManualMetadata({
        ...model,
        inputModalities: input,
        outputModalities: output,
      });
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  if (flow) {
    return (
      <span className={`model-capability-row model-modality-row ${canEditManual ? "editable" : ""}`} title={`${flow.input.map(modalityLabel).join(", ")} -> ${flow.output.map(modalityLabel).join(", ")}`}>
        <span
          className="model-modality-flow"
          onClick={(event) => {
            if (!canEditManual) return;
            event.stopPropagation();
            setIsEditing((current) => !current);
          }}
        >
          {flow.input.map((modality) => (
            <ModalityChip key={`in-${modality}`} modality={modality} />
          ))}
          <span className="model-modality-arrow">→</span>
          {flow.output.map((modality) => (
            <ModalityChip key={`out-${modality}`} modality={modality} />
          ))}
        </span>
        {canEditManual && isEditing ? (
          <span className="model-modality-editor" onClick={(event) => event.stopPropagation()}>
            <span className="model-modality-editor-row">
              <span className="model-modality-editor-label">Input</span>
              {editableModalities.map((modality) => (
                <button
                  className={`model-modality-editor-chip ${inputModalities.includes(modality) ? "active" : ""}`}
                  key={`input-${modality}`}
                  onClick={() => setInputModalities((current) => toggleSelection(current, modality))}
                  title={modalityLabel(modality)}
                  type="button"
                >
                  <ModalityChip modality={modality} />
                </button>
              ))}
            </span>
            <span className="model-modality-editor-row">
              <span className="model-modality-editor-label">Output</span>
              {editableModalities.map((modality) => (
                <button
                  className={`model-modality-editor-chip ${outputModalities.includes(modality) ? "active" : ""}`}
                  key={`output-${modality}`}
                  onClick={() => setOutputModalities((current) => toggleSelection(current, modality))}
                  title={modalityLabel(modality)}
                  type="button"
                >
                  <ModalityChip modality={modality} />
                </button>
              ))}
            </span>
            <span className="model-modality-editor-actions">
              <button className="secondary-button compact-button" onClick={() => setIsEditing(false)} type="button">
                Cancel
              </button>
              <button className="primary-button compact-button" disabled={isSaving || !canSaveSelection(inputModalities, outputModalities)} onClick={() => void saveManualMetadata()} type="button">
                Save
              </button>
            </span>
          </span>
        ) : null}
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
