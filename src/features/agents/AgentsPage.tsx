import { useMemo, useState } from "react";
import { appApi } from "../../api/tauri";
import type { AgentKind, ApiProvider, Provider, RemoteModel } from "../../types";
import { useI18n } from "../../i18n/context";
import {
  defaultModelForAgent,
  emptyProvider,
  patchProviderPreviewField,
  patchProviderPreviewFromFields,
  renderCodexOAuthPreview,
  renderProviderPreview,
} from "../../utils/providerConfig";
import {
  avatarSourceForProvider,
  countProvidersByAgent,
  filterModels,
  sortAgentProviders,
} from "./agentUtils";
import { AgentProviderForm } from "./components/AgentProviderForm";
import { AgentProviderList } from "./components/AgentProviderList";
import type { AgentsPageProps } from "./types";

export function AgentsPage({
  apiProviders,
  providers,
  onSave,
  onDelete,
  onActivate,
  onLaunchProvider,
}: AgentsPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"list" | "form">("list");
  const [draft, setDraft] = useState<Provider>(emptyProvider);
  const [activeAgent, setActiveAgent] = useState<AgentKind>("codex");
  const [modelOptions, setModelOptions] = useState<RemoteModel[]>([]);
  const [modelSearch, setModelSearch] = useState("");
  const [isModelListOpen, setIsModelListOpen] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);

  const sortedProviders = useMemo(() => sortAgentProviders(providers), [providers]);
  const tabCounts = useMemo(() => countProvidersByAgent(providers), [providers]);
  const visibleProviders = useMemo(
    () => sortedProviders.filter((provider) => provider.agent === activeAgent),
    [sortedProviders, activeAgent],
  );

  const enabledApiProviders = useMemo(
    () =>
      [...apiProviders]
        .filter((provider) => provider.enabled)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apiProviders],
  );

  const selectedApiProvider = useMemo(
    () => enabledApiProviders.find((provider) => provider.id === draft.apiProviderId),
    [draft.apiProviderId, enabledApiProviders],
  );

  const filteredModelOptions = useMemo(
    () => filterModels(modelOptions, modelSearch),
    [modelOptions, modelSearch],
  );

  const resetModelPicker = () => {
    setModelOptions([]);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
  };

  const openForm = (provider?: Provider) => {
    const base = provider ?? { ...emptyProvider, agent: activeAgent, model: defaultModelForAgent(activeAgent) };
    const linkedApiProvider = enabledApiProviders.find((item) => item.id === base.apiProviderId);
    const initial: Provider = {
      ...base,
      apiProviderId: base.apiProviderId || linkedApiProvider?.id || "",
      configText: base.configText || renderProviderPreview(base),
    };
    setDraft(initial);
    setModelOptions(linkedApiProvider?.models ?? []);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyProvider);
    resetModelPicker();
    setView("list");
  };

  const updateDraft = (field: keyof Provider, value: string) => {
    if (field === "baseUrl" || field === "apiKey" || field === "apiProviderId") {
      resetModelPicker();
    }

    setDraft((current) => {
      const next = { ...current, [field]: value };
      return {
        ...next,
        configText: patchProviderPreviewField(next, field, value),
      };
    });
  };

  const applyApiProvider = (apiProviderId: string) => {
    const apiProvider = enabledApiProviders.find((item) => item.id === apiProviderId);
    setModelOptions(apiProvider?.models ?? []);
    setModelSearch("");
    setIsModelListOpen(false);
    setModelListError(null);
    setDraft((current) => {
      const next = {
        ...current,
        apiProviderId,
        baseUrl: apiProvider?.baseUrl ?? "",
        apiKey: apiProvider?.apiKey ?? "",
        websiteUrl: apiProvider?.websiteUrl ?? "",
        wireApi: apiProvider?.wireApi ?? current.wireApi,
      };
      const providerModels = apiProvider?.models ?? [];
      const modelStillAvailable = providerModels.some((model) => model.id === next.model);
      const withModel =
        modelStillAvailable || !apiProvider
          ? next
          : { ...next, model: providerModels[0]?.id ?? defaultModelForAgent(next.agent) };
      const configText =
        withModel.agent === "codex"
          && apiProvider?.providerType === "openai_oauth"
          && apiProvider.openAiAuthJson
          ? renderCodexOAuthPreview(withModel.model, apiProvider.openAiAuthJson)
          : patchProviderPreviewFromFields(withModel);
      return {
        ...withModel,
        configText,
      };
    });
  };

  const updatePreview = (value: string) => {
    setDraft((current) => ({
      ...current,
      configText: value,
    }));
  };

  const handleSubmit = async () => {
    await onSave(draft);
    closeForm();
  };

  const loadModelOptions = async () => {
    if (!draft.baseUrl.trim()) {
      setModelListError(t("modelBaseUrlRequired"));
      return;
    }

    setIsLoadingModels(true);
    setModelListError(null);
    setIsModelListOpen(true);

    try {
      const models = await appApi.listProviderModels({
        providerType: selectedApiProvider?.providerType ?? "openai-compatible",
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
      });
      setModelOptions(models);
      setModelSearch("");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setModelListError(detail || t("modelListError"));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const agentLabel = (agent: AgentKind): string => {
    if (agent === "claude") return t("agentClaude");
    if (agent === "gemini") return t("agentGemini");
    return t("agentCodex");
  };

  if (view === "form") {
    return (
      <AgentProviderForm
        draft={draft}
        enabledApiProviders={enabledApiProviders}
        modelOptions={modelOptions}
        filteredModelOptions={filteredModelOptions}
        isModelListOpen={isModelListOpen}
        isLoadingModels={isLoadingModels}
        modelListError={modelListError}
        labels={{
          edit: t("edit"),
          addProvider: t("addProvider"),
          back: t("back"),
          name: t("name"),
          apiProvider: t("apiProvider"),
          manualProvider: t("manualProvider"),
          model: t("model"),
          chooseModel: t("chooseModel"),
          refreshModels: t("refreshModels"),
          fetchModels: t("fetchModels"),
          loadingModels: t("loadingModels"),
          noModelsFound: t("noModelsFound"),
          modelFromProvider: t("modelFromProvider"),
          baseUrl: t("baseUrl"),
          apiKey: t("apiKey"),
          templateGuide: t("templateGuide"),
          templateGuideHint: t("templateGuideHint"),
          configPreview: t("configPreview"),
          configPreviewHint: t("configPreviewHint"),
          save: t("save"),
          create: t("create"),
        }}
        agentLabel={agentLabel}
        onClose={closeForm}
        onUpdateDraft={updateDraft}
        onApplyApiProvider={applyApiProvider}
        onModelInput={(model) => {
          updateDraft("model", model);
          setModelSearch(model);
          if (modelOptions.length) setIsModelListOpen(true);
        }}
        onToggleModelList={() => {
          setModelSearch("");
          if (modelOptions.length) {
            setIsModelListOpen((open) => !open);
          } else {
            void loadModelOptions();
          }
        }}
        onOpenModelListIfOptions={() => {
          if (modelOptions.length) setIsModelListOpen(true);
        }}
        onFetchModels={() => void loadModelOptions()}
        onSelectModel={(model) => {
          updateDraft("model", model);
          setModelSearch("");
          setIsModelListOpen(false);
        }}
        onUpdatePreview={updatePreview}
        onSubmit={() => void handleSubmit()}
      />
    );
  }

  return (
    <AgentProviderList
      activeAgent={activeAgent}
      providers={visibleProviders}
      tabCounts={tabCounts}
      apiProviders={apiProviders}
      labels={{
        addProvider: t("addProvider"),
        edit: t("edit"),
        openCli: t("openCli"),
        enable: t("enable"),
        del: t("del"),
        noProviders: t("noProviders"),
      }}
      agentLabel={agentLabel}
      avatarSourceForProvider={avatarSourceForProvider}
      onSelectAgent={setActiveAgent}
      onAddProvider={() => openForm()}
      onEditProvider={openForm}
      onLaunchProvider={(id) => void onLaunchProvider(id)}
      onActivateProvider={(id) => void onActivate(id)}
      onDeleteProvider={(id) => void onDelete(id)}
    />
  );
}
