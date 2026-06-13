import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { appApi } from "../../api/tauri";
import type { ApiProvider, ApiProviderType, CompleteOpenAiOauthResult } from "../../types";
import { useI18n } from "../../i18n/context";
import { ProviderForm } from "./components/ProviderForm";
import { ProviderList } from "./components/ProviderList";
import { useProviderBalances } from "./hooks/useProviderBalances";
import {
  emptyApiProvider,
  inferProviderType,
  normalizeProviderType,
  providerTypes,
} from "./providerConfig";
import type { ProvidersPageProps } from "./types";

export function ProvidersPage({ providers, onSave, onDelete, onNotify }: ProvidersPageProps) {
  const { t } = useI18n();
  const [view, setView] = useState<"empty" | "form">("empty");
  const [draft, setDraft] = useState<ApiProvider>(emptyApiProvider);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelListError, setModelListError] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState("");
  const [oauthCallbackInput, setOauthCallbackInput] = useState("");
  const [oauthAuthUrl, setOauthAuthUrl] = useState("");
  const [oauthManualMode, setOauthManualMode] = useState(false);
  const [isOauthBusy, setIsOauthBusy] = useState(false);
  const { balanceMap, loadingBalanceId, refreshBalance } = useProviderBalances();

  const sortedProviders = useMemo(
    () =>
      [...providers].sort((a, b) => {
        if (a.enabled && !b.enabled) return -1;
        if (!a.enabled && b.enabled) return 1;
        return a.name.localeCompare(b.name);
      }),
    [providers],
  );
  const selectedProviderId = draft.id || null;

  const resetTransientState = () => {
    setModelListError(null);
    setOauthStatus("");
    setOauthCallbackInput("");
    setOauthAuthUrl("");
    setOauthManualMode(false);
    setIsOauthBusy(false);
  };

  const openForm = (provider?: ApiProvider) => {
    setDraft(provider ? { ...provider, providerType: inferProviderType(provider) } : emptyApiProvider);
    resetTransientState();
    setView("form");
  };

  const closeForm = () => {
    setDraft(emptyApiProvider);
    resetTransientState();
    setView("empty");
  };

  const saveCompletedOpenAiOauth = useCallback(
    async (result: CompleteOpenAiOauthResult) => {
      const providerToSave: ApiProvider = {
        ...draft,
        name: draft.name.trim() || result.email || "OpenAI OAuth",
        providerType: "openai_oauth",
        baseUrl: "",
        apiKey: "",
        websiteUrl: "https://chatgpt.com",
        openAiAuthJson: result.authJson,
        enabled: true,
      };
      setDraft(providerToSave);
      onNotify("OpenAI OAuth complete. Saving provider...", "ok");
      await onSave(providerToSave);
      setOauthStatus("OAuth complete. API provider saved.");
      onNotify("OpenAI OAuth provider saved.", "ok");
      setOauthManualMode(false);
      setOauthCallbackInput("");
      closeForm();
    },
    [draft, onNotify, onSave],
  );

  useEffect(() => {
    if (view !== "form" || normalizeProviderType(draft.providerType) !== "openai_oauth") return;
    let active = true;
    const unlisten = listen<string>("openai-oauth-code", async (event) => {
      if (!active) return;
      setIsOauthBusy(true);
      setOauthStatus("OAuth code received. Exchanging token...");
      try {
        const result = await appApi.completeOpenAiOauth(event.payload);
        if (!active) return;
        await saveCompletedOpenAiOauth(result);
      } catch (error) {
        setOauthStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setIsOauthBusy(false);
      }
    });
    return () => {
      active = false;
      unlisten.then((fn) => fn());
    };
  }, [view, draft.providerType, saveCompletedOpenAiOauth]);

  const updateDraft = <K extends keyof ApiProvider>(field: K, value: ApiProvider[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
    if (field === "baseUrl" || field === "apiKey") {
      setModelListError(null);
    }
  };

  const applyProviderType = (providerType: ApiProviderType) => {
    const normalizedType = normalizeProviderType(providerType);
    const preset = providerTypes.find((item) => item.value === normalizedType);
    const previousPreset = providerTypes.find((item) => item.value === normalizeProviderType(draft.providerType));
    setDraft((current) => ({
      ...current,
      providerType: normalizedType,
      apiKey: normalizedType === "openai_oauth" ? "" : current.apiKey,
      openAiAuthJson: normalizedType === "openai_apikey" ? undefined : current.openAiAuthJson,
      baseUrl:
        normalizedType === "openai_oauth"
          ? ""
          : !current.baseUrl || current.baseUrl === previousPreset?.baseUrl
            ? preset?.baseUrl || ""
            : current.baseUrl,
      websiteUrl:
        !current.websiteUrl || current.websiteUrl === previousPreset?.websiteUrl
          ? preset?.websiteUrl || ""
          : current.websiteUrl,
    }));
  };

  const refreshModels = async () => {
    if (!draft.baseUrl.trim()) {
      setModelListError(t("modelBaseUrlRequired"));
      return;
    }

    setIsLoadingModels(true);
    setModelListError(null);
    try {
      const models = await appApi.listProviderModels({
        providerType: draft.providerType,
        baseUrl: draft.baseUrl,
        apiKey: draft.apiKey,
      });
      setDraft((current) => ({ ...current, models }));
      onNotify(`${models.length} ${t("modelsLoaded")}`, "ok");
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setModelListError(detail || t("modelListError"));
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSubmit = async () => {
    const normalizedProviderType = normalizeProviderType(draft.providerType);
    if (normalizedProviderType === "openai_oauth" && !draft.openAiAuthJson?.trim()) {
      setOauthStatus("OpenAI OAuth is not complete yet. Login first, then save.");
      return;
    }
    await onSave({
      ...draft,
      providerType: normalizedProviderType,
      wireApi: draft.wireApi === "chat" ? "chat" : "responses",
    });
    closeForm();
  };

  const startOfficialOpenAiOauth = async () => {
    setIsOauthBusy(true);
    setOauthStatus("Generating OpenAI OAuth URL...");
    setOauthManualMode(false);
    setOauthCallbackInput("");
    setOauthAuthUrl("");
    try {
      const result = await appApi.startOpenAiOauth(true);
      setOauthAuthUrl(result.authUrl);
      if (result.manualCallbackRequired) {
        setOauthManualMode(true);
        setOauthStatus(result.message || "Finish login in the browser, then paste the callback URL below.");
      } else {
        setOauthManualMode(true);
        setOauthStatus("Browser opened. Finish OpenAI login there. If it does not complete automatically, paste the callback URL below.");
      }
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOauthBusy(false);
    }
  };

  const copyOfficialOpenAiOauthUrl = async () => {
    setIsOauthBusy(true);
    setOauthStatus("Generating OpenAI OAuth URL...");
    setOauthManualMode(true);
    setOauthCallbackInput("");
    try {
      const result = await appApi.startOpenAiOauth(false);
      setOauthAuthUrl(result.authUrl);
      setOauthStatus("OAuth URL generated. Open it in your browser, finish login, then paste the callback URL below.");
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOauthBusy(false);
    }
  };

  const submitOfficialOpenAiCallback = async () => {
    if (!oauthCallbackInput.trim()) {
      setOauthStatus("Paste the callback URL before finishing OAuth.");
      return;
    }
    setIsOauthBusy(true);
    setOauthStatus("Reading callback URL. Exchanging token...");
    try {
      const result = await appApi.completeOpenAiOauthCallback(oauthCallbackInput);
      await saveCompletedOpenAiOauth(result);
    } catch (error) {
      setOauthStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setIsOauthBusy(false);
    }
  };

  const openWebsite = async (url: string) => {
    try {
      await appApi.openExternalUrl(url);
    } catch (error) {
      console.error("Failed to open website", error);
    }
  };

  return (
    <section className="page providers-page">
      <div className="provider-workspace">
        <ProviderList
          providers={sortedProviders}
          balanceMap={balanceMap}
          loadingBalanceId={loadingBalanceId}
          selectedProviderId={selectedProviderId}
          labels={{
            providers: t("providers"),
            apiProviders: t("apiProviders"),
            addProvider: t("addProvider"),
            models: t("models"),
            del: t("del"),
            noApiProviders: t("noApiProviders"),
          }}
          onAddProvider={() => openForm()}
          onSelectProvider={openForm}
          onDeleteProvider={(id) => void onDelete(id)}
          onOpenWebsite={(url) => void openWebsite(url)}
          onRefreshBalance={(provider) => void refreshBalance(provider)}
        />
        {view === "form" ? (
          <ProviderForm
        draft={draft}
        isLoadingModels={isLoadingModels}
        modelListError={modelListError}
        oauth={{
          isBusy: isOauthBusy,
          status: oauthStatus,
          authUrl: oauthAuthUrl,
          manualMode: oauthManualMode,
          callbackInput: oauthCallbackInput,
        }}
        labels={{
          edit: t("edit"),
          newProvider: t("newProvider"),
          apiProvider: t("apiProvider"),
          back: t("back"),
          name: t("name"),
          providerType: t("providerType"),
          baseUrl: t("baseUrl"),
          officialWebsite: t("officialWebsite"),
          apiKey: t("apiKey"),
          providerEnabled: t("providerEnabled"),
          modelList: t("modelList"),
          refreshModels: t("refreshModels"),
          fetchModels: t("fetchModels"),
          loadingModels: t("loadingModels"),
          noModelsFound: t("noModelsFound"),
          modelFromProvider: t("modelFromProvider"),
          save: t("save"),
          create: t("create"),
        }}
        onClose={closeForm}
        onUpdateDraft={updateDraft}
        onApplyProviderType={applyProviderType}
        onRefreshModels={() => void refreshModels()}
        onSubmit={() => void handleSubmit()}
        onOauthCallbackInputChange={setOauthCallbackInput}
        onStartOauthLogin={() => void startOfficialOpenAiOauth()}
        onGenerateOauthUrl={() => void copyOfficialOpenAiOauthUrl()}
        onSubmitOauthCallback={() => void submitOfficialOpenAiCallback()}
          />
        ) : (
          <div className="provider-detail-empty">
            <div className="provider-detail-empty-mark">CS</div>
            <p>{t("selectProvider")}</p>
            <button className="primary-button" onClick={() => openForm()} type="button">
              {t("addProvider")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
