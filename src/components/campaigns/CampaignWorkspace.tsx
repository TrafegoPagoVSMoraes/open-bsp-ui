import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Eye,
  FileUp,
  FlaskConical,
  LoaderCircle,
  Megaphone,
  Play,
  RefreshCw,
  Search,
  Tags,
  Users,
} from "lucide-react";
import type { TemplateData } from "@/supabase/client";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import { useContacts } from "@/queries/useContacts";
import { useTemplates } from "@/queries/useTemplates";
import { useTrackingProjects } from "@/queries/useTracking";
import {
  type CampaignSummary,
  useCampaignActions,
  useCampaignAudience,
  useCampaignRealtime,
  useCampaigns,
} from "@/queries/useCampaigns";
import {
  type CampaignImportPreview,
  firstName,
  normalizeCampaignPhone,
  parseCampaignImport,
} from "@/utils/CampaignImportUtils";
import useBoundStore from "@/stores/useBoundStore";

type AudienceMode = "import" | "tags";
type Mapping = { source: string; constant?: string };

const inputClass =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/40";
const cardClass = "rounded-2xl border border-border bg-card p-5 text-foreground shadow-sm";

function messagePreview(template: TemplateData | undefined, mappings: Record<string, Mapping>) {
  if (!template) return [];
  const valueFor = (variable: string) => {
    const mapping = mappings[variable];
    if (mapping?.source === "constant") return mapping.constant || `{{${variable}}}`;
    if (mapping?.source === "full_name") return "Maria de Souza";
    if (mapping?.source === "first_name") return "Maria";
    return `{{${variable}}}`;
  };
  return template.components.flatMap((component) => {
    const text = (component as { text?: string }).text;
    if (!text) return [];
    return [{
      type: component.type,
      text: text.replace(
        /\{\{\s*([^}]+?)\s*\}\}/g,
        (_match: string, variable: string) => valueFor(variable),
      ),
    }];
  });
}

function templateVariables(template?: TemplateData) {
  if (!template) return [];
  const names: string[] = [];
  for (const component of template.components) {
    if (!("text" in component) || !component.text) continue;
    for (const match of component.text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) names.push(match[1]);
  }
  return Array.from(new Set(names));
}

function hasDynamicUrl(template?: TemplateData) {
  return template?.components.some((component) =>
    component.type === "BUTTONS" && component.buttons.some((button) =>
      button.type === "URL" && /\{\{\s*[^}]+?\s*\}\}/.test(button.url)
    )
  ) ?? false;
}

function defaultMapping(variable: string): Mapping {
  const normalized = variable.toLocaleLowerCase("pt-BR");
  if (normalized.includes("primeiro") || normalized === "first_name") return { source: "first_name" };
  if (normalized.includes("nome_completo") || normalized === "name") return { source: "full_name" };
  return { source: "constant", constant: "" };
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold text-foreground">{value.toLocaleString("pt-BR")}</div>
    </div>
  );
}

function CampaignRow({ campaign, onCancel }: { campaign: CampaignSummary; onCancel: () => void }) {
  const processed = campaign.accepted + campaign.sent + campaign.delivered + campaign.read + campaign.failed + campaign.skipped;
  const percentage = campaign.total ? Math.min(100, Math.round((processed / campaign.total) * 100)) : 0;
  const cancellable = ["draft", "scheduled", "queued", "running"].includes(campaign.status);
  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium text-foreground">{campaign.name}</div>
          <div className="text-xs text-muted-foreground">
            {new Date(campaign.created_at).toLocaleString("pt-BR")} · {campaign.status}
          </div>
        </div>
        {cancellable && (
          <button className="flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive" onClick={onCancel}>
            <Ban className="h-4 w-4" /> Cancelar
          </button>
        )}
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-slate-300 transition-all" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{percentage}% processado</span><span>{campaign.total} total</span><span>{campaign.pending} pendentes</span>
        <span>{campaign.delivered} entregues</span><span>{campaign.read} lidas</span><span>{campaign.failed} erros</span>
        <span>{campaign.skipped} ignoradas</span>
      </div>
    </div>
  );
}

export default function CampaignWorkspace() {
  const activeProjectId = useBoundStore((state) => state.ui.activeProjectId);
  useCampaignRealtime();
  const [mode, setMode] = useState<AudienceMode>("import");
  const [preview, setPreview] = useState<CampaignImportPreview>();
  const [fileError, setFileError] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [excludedTags, setExcludedTags] = useState<string[]>([]);
  const [organizationAddress, setOrganizationAddress] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [templateSearch, setTemplateSearch] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [mappings, setMappings] = useState<Record<string, Mapping>>({});
  const [testPhone, setTestPhone] = useState("");
  const [testName, setTestName] = useState("");
  const [testMode, setTestMode] = useState<"manual" | "contact">("manual");
  const [testContactId, setTestContactId] = useState("");
  const [trackingProjectId, setTrackingProjectId] = useState("");
  const [trackingDestination, setTrackingDestination] = useState("");
  const [notice, setNotice] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [hideTests, setHideTests] = useState(false);
  const [hideCancelled, setHideCancelled] = useState(false);

  useEffect(() => {
    setHideTests(window.localStorage.getItem("openbsp:campaigns:hide-tests") === "true");
    setHideCancelled(window.localStorage.getItem("openbsp:campaigns:hide-cancelled") === "true");
  }, []);

  useEffect(() => {
    window.localStorage.setItem("openbsp:campaigns:hide-tests", String(hideTests));
  }, [hideTests]);

  useEffect(() => {
    window.localStorage.setItem("openbsp:campaigns:hide-cancelled", String(hideCancelled));
  }, [hideCancelled]);

  const { data: addresses } = useOrganizationsAddresses();
  const whatsappAddresses = addresses?.filter((item) => item.service === "whatsapp") ?? [];
  const { data: templates, isLoading: templatesLoading } = useTemplates(organizationAddress);
  const utilityTemplates = templates?.filter((template) => template.status === "APPROVED" && template.category === "UTILITY") ?? [];
  const filteredTemplates = utilityTemplates.filter((template) =>
    template.name.toLocaleLowerCase("pt-BR").includes(templateSearch.toLocaleLowerCase("pt-BR")),
  );
  const selectedTemplate = utilityTemplates.find((template) => template.id === templateId);
  const variables = useMemo(() => templateVariables(selectedTemplate), [selectedTemplate]);
  const { data: trackingProjects } = useTrackingProjects();
  const activeTrackingProjects = trackingProjects?.filter((project) => project.status === "active") ?? [];
  const { data: audience, isFetching: audienceLoading } = useCampaignAudience(selectedTags, excludedTags, organizationAddress);
  const { data: contacts = [] } = useContacts();
  const { data: campaigns, isLoading: campaignsLoading, refetch } = useCampaigns();
  const actions = useCampaignActions();

  const audienceCount = mode === "import" ? preview?.records.length ?? 0 : audience?.eligible ?? 0;
  const busy = actions.createCampaign.isPending || actions.startCampaign.isPending ||
    actions.scheduleCampaign.isPending;

  function selectTemplate(id: string) {
    setTemplateId(id);
    const template = utilityTemplates.find((item) => item.id === id);
    setMappings(Object.fromEntries(templateVariables(template).map((variable) => [variable, defaultMapping(variable)])));
  }

  async function importFile(file?: File) {
    if (!file) return;
    setFileError("");
    setNotice("");
    try {
      const localPreview = await parseCampaignImport(file);
      setPreview(localPreview);
      const serverPreview = await actions.previewImport.mutateAsync({ records: localPreview.records, organizationAddress });
      setNotice(
        `Prévia validada no servidor: ${serverPreview.eligible} elegíveis, ${serverPreview.opted_out} opt-outs e ${serverPreview.duplicates} duplicados.`,
      );
    } catch (error) {
      setPreview(undefined);
      setFileError(error instanceof Error ? error.message : "Não foi possível ler o arquivo.");
    }
  }

  function payload() {
    return {
      name: campaignName.trim() || `Campanha ${new Date().toLocaleString("pt-BR")}`,
      organization_address: organizationAddress,
      audience:
        mode === "import"
          ? { type: "import", records: preview?.records ?? [], tag_ids: selectedTags }
          : { type: "tags", tag_ids: selectedTags, exclude_tag_ids: excludedTags },
      template: selectedTemplate ? { id: selectedTemplate.id } : null,
      variable_mapping: mappings,
      tracking: trackingProjectId && trackingDestination.trim()
        ? { project_id: trackingProjectId, destination_url: trackingDestination.trim() }
        : null,
    };
  }

  async function sendTest() {
    setNotice("");
    const selectedContact = contacts.find((contact) => contact.id === testContactId);
    const selectedAddress = selectedContact?.addresses.find(
      (address) => address.service === "whatsapp" && address.address,
    )?.address;
    const resolvedName = testMode === "contact" ? selectedContact?.name ?? "" : testName;
    const phone = normalizeCampaignPhone(testMode === "contact" ? selectedAddress ?? "" : testPhone);
    if (!phone) return setNotice("Informe um número de teste válido com DDD.");
    if (!selectedTemplate) return setNotice("Selecione um template antes do teste.");
    try {
      const result = await actions.createTest.mutateAsync({
        ...payload(),
        test_recipient: { phone, name: resolvedName.trim(), first_name: firstName(resolvedName) },
      });
      setNotice(`Teste solicitado ao backend (${result.status}). Esse número não entra na campanha.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Falha ao enviar o teste.");
    }
  }

  async function launch() {
    setNotice("");
    if (!activeProjectId) return setNotice("Selecione um único projeto no menu da conta antes de criar a campanha.");
    if (!organizationAddress || !selectedTemplate) return setNotice("Selecione o número remetente e um template UTILITY aprovado.");
    if (!audienceCount) return setNotice("A campanha precisa ter pelo menos um destinatário elegível.");
    if (hasDynamicUrl(selectedTemplate) && (!trackingProjectId || !trackingDestination.trim())) return setNotice("Selecione o projeto de tracking e a URL final.");
    if (variables.some((variable) => !mappings[variable] || (mappings[variable].source === "constant" && !mappings[variable].constant?.trim()))) {
      return setNotice("Preencha o mapeamento de todas as variáveis do template.");
    }
    const scheduleDate = scheduledAt ? new Date(scheduledAt) : null;
    if (
      scheduleDate &&
      (Number.isNaN(scheduleDate.getTime()) || scheduleDate.getTime() < Date.now() + 60_000)
    ) {
      return setNotice("Escolha um horário futuro com pelo menos 1 minuto de antecedência.");
    }
    try {
      const created = await actions.createCampaign.mutateAsync(payload());
      if (scheduleDate) {
        await actions.scheduleCampaign.mutateAsync({
          campaignId: created.id,
          scheduledAt: scheduleDate.toISOString(),
        });
        setNotice(`Campanha agendada para ${scheduleDate.toLocaleString("pt-BR")}. ID: ${created.id}`);
      } else {
        await actions.startCampaign.mutateAsync(created.id);
        setNotice(`Campanha criada e colocada na fila. ID: ${created.id}`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a campanha.");
    }
  }

  return (
    <main className="h-full overflow-y-auto bg-background text-foreground">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 p-5 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-2xl font-semibold text-foreground"><Megaphone className="h-6 w-6" /> Campanhas</div>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Prepare o público e o template aqui. O envio é executado no backend, com deduplicação e bloqueio de opt-outs.
            </p>
            {!activeProjectId && <p className="mt-2 text-sm text-amber-400">O histórico respeita o filtro global. Para preparar um novo envio, selecione um projeto específico.</p>}
          </div>
          <button className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </button>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className={`${cardClass} space-y-5`}>
            <div><h2 className="font-semibold text-foreground">1. Destinatários</h2><p className="text-sm text-muted-foreground">Importe uma lista ou selecione contatos por TAG.</p></div>
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950 p-1">
              <button onClick={() => setMode("import")} className={`rounded-lg px-3 py-2 text-sm ${mode === "import" ? "bg-slate-700 font-medium text-white shadow-sm" : "text-slate-300"}`}><FileUp className="mr-2 inline h-4 w-4" />Importar arquivo</button>
              <button onClick={() => setMode("tags")} className={`rounded-lg px-3 py-2 text-sm ${mode === "tags" ? "bg-slate-700 font-medium text-white shadow-sm" : "text-slate-300"}`}><Tags className="mr-2 inline h-4 w-4" />Selecionar TAGs</button>
            </div>

            {mode === "import" ? (
              <div>
                <label className="flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-border p-7 text-center hover:bg-muted/40">
                  <FileUp className="mb-2 h-7 w-7 text-slate-200" />
                  <span className="font-medium">CSV, XLSX, JSON ou XML</span>
                  <span className="mt-1 text-xs text-muted-foreground">Para planilhas XLS antigas, salve como XLSX ou CSV UTF-8.</span>
                  <input type="file" className="hidden" accept=".csv,.json,.xml,.xls,.xlsx" onChange={(event) => void importFile(event.target.files?.[0])} />
                </label>
                {fileError && <p className="mt-2 text-sm text-destructive">{fileError}</p>}
                {preview && (
                  <div className="mt-4 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                    <Metric label="Válidos únicos" value={preview.records.length} /><Metric label="Duplicados locais" value={preview.duplicates} /><Metric label="Inválidos" value={preview.invalid} />
                    </div>
                    <div>
                      <div className="mb-2 text-sm text-muted-foreground">TAGs opcionais para os contatos importados</div>
                      <div className="flex flex-wrap gap-2">
                        {(audience?.tags ?? []).filter((tag) => tag.name.toLocaleLowerCase("pt-BR") !== "opt-out").map((tag) => {
                          const selected = selectedTags.includes(tag.id);
                          return <button type="button" key={tag.id} onClick={() => setSelectedTags((current) => selected ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? "border-slate-400 bg-slate-700 text-white" : "border-slate-600 text-slate-200"}`}>{tag.name}</button>;
                        })}
                        {!audienceLoading && !audience?.tags?.length && <span className="text-sm text-muted-foreground">Nenhuma TAG manual disponível.</span>}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">Contatos existentes não têm nome ou e-mail sobrescritos. A TAG opt-out é automática.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="mb-3 text-sm text-muted-foreground">Selecione uma ou mais etiquetas. Sem seleção, a prévia considera todos os contatos.</div>
                <div className="flex flex-wrap gap-2">
                  {(audience?.tags ?? []).map((tag) => {
                    const selected = selectedTags.includes(tag.id);
                    return <button key={tag.id} onClick={() => setSelectedTags((current) => selected ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? "border-slate-400 bg-slate-700 text-white" : "border-slate-600 text-slate-200"}`}>{tag.name}{tag.contacts_count != null ? ` (${tag.contacts_count})` : ""}</button>;
                  })}
                  {!audienceLoading && !audience?.tags?.length && <span className="text-sm text-muted-foreground">Nenhuma TAG disponível.</span>}
                </div>
                <div className="mt-4 border-t border-slate-700 pt-4">
                  <div className="mb-2 text-sm font-medium text-slate-100">Remover contatos com estas TAGs</div>
                  <div className="flex flex-wrap gap-2">
                    {(audience?.tags ?? []).map((tag) => {
                      const selected = excludedTags.includes(tag.id);
                      return <button key={`exclude:${tag.id}`} type="button" onClick={() => setExcludedTags((current) => selected ? current.filter((id) => id !== tag.id) : [...current, tag.id])} className={`rounded-full border px-3 py-1.5 text-sm ${selected ? "border-rose-400 bg-rose-500/15 text-rose-200" : "border-slate-600 text-slate-200"}`}>Excluir {tag.name}</button>;
                    })}
                  </div>
                  <p className="mt-2 text-xs text-slate-300">A inclusão usa qualquer TAG selecionada. A exclusão prevalece e é reavaliada no horário agendado.</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3"><Metric label="Elegíveis" value={audience?.eligible ?? 0} /><Metric label="Opt-outs" value={audience?.opted_out ?? 0} /><Metric label="Inválidos/duplicados" value={(audience?.invalid ?? 0) + (audience?.duplicates ?? 0)} /></div>
              </div>
            )}
          </section>

          <section className={`${cardClass} space-y-4`}>
            <div><h2 className="font-semibold text-foreground">2. Template e variáveis</h2><p className="text-sm text-muted-foreground">Apenas templates APPROVED da categoria UTILITY.</p></div>
            <label className="block text-sm">Nome da campanha<input className={`${inputClass} mt-1`} value={campaignName} onChange={(event) => setCampaignName(event.target.value)} placeholder="Ex.: Aula 3 — manhã" /></label>
            <label className="block text-sm">Número remetente<select className={`${inputClass} mt-1`} value={organizationAddress} onChange={(event) => { setOrganizationAddress(event.target.value); setTemplateId(""); }}><option value="">Selecione</option>{whatsappAddresses.map((item) => <option key={`${item.service}:${item.address}`} value={item.address}>{item.address}</option>)}</select></label>
            <label className="block text-sm">Pesquisar template<div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input className={`${inputClass} pl-9`} value={templateSearch} onChange={(event) => setTemplateSearch(event.target.value)} placeholder="Nome do template" /></div></label>
            <label className="block text-sm">Template<select className={`${inputClass} mt-1`} disabled={!organizationAddress || templatesLoading} value={templateId} onChange={(event) => selectTemplate(event.target.value)}><option value="">{templatesLoading ? "Carregando..." : "Selecione"}</option>{filteredTemplates.map((template) => <option key={template.id} value={template.id}>{template.name} · {template.language}</option>)}</select></label>
            {selectedTemplate && hasDynamicUrl(selectedTemplate) && (
              <div className="grid gap-3 rounded-xl border border-border p-3">
                <p className="text-sm font-medium text-foreground">Tracking individual do botão</p>
                <label className="block text-sm">Projeto de tracking
                  <select className={`${inputClass} mt-1`} value={trackingProjectId} onChange={(event) => {
                    const projectId = event.target.value;
                    setTrackingProjectId(projectId);
                    const project = activeTrackingProjects.find((item) => item.id === projectId);
                    if (!trackingDestination && project?.default_destination_url) setTrackingDestination(project.default_destination_url);
                  }}>
                    <option value="">Selecione</option>
                    {activeTrackingProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                  </select>
                </label>
                <label className="block text-sm">URL final da página
                  <input className={`${inputClass} mt-1`} type="url" value={trackingDestination} onChange={(event) => setTrackingDestination(event.target.value)} placeholder="https://exemplo.com/pagina" />
                </label>
                <p className="text-xs text-muted-foreground">Cada destinatário recebe um token opaco próprio. A página deve usar o coletor OpenBSP para registrar os botões clicados.</p>
              </div>
            )}
            {variables.map((variable) => (
              <div key={variable} className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[minmax(120px,0.7fr)_1fr]">
                <div className="self-center text-sm font-medium">{`{{${variable}}}`}</div>
                <div className="flex gap-2">
                  <select className={inputClass} value={mappings[variable]?.source ?? "constant"} onChange={(event) => setMappings((current) => ({ ...current, [variable]: { source: event.target.value, constant: current[variable]?.constant } }))}>
                    <option value="first_name">Primeiro nome</option><option value="full_name">Nome completo</option>
                    {preview?.columns.map((column) => <option key={column} value={`column:${column}`}>Coluna: {column}</option>)}
                    <option value="constant">Valor fixo</option>
                  </select>
                  {mappings[variable]?.source === "constant" && <input className={inputClass} value={mappings[variable]?.constant ?? ""} onChange={(event) => setMappings((current) => ({ ...current, [variable]: { source: "constant", constant: event.target.value } }))} placeholder="Valor" />}
                </div>
              </div>
            ))}
            {selectedTemplate && (
              <div className="rounded-xl border border-slate-700 bg-slate-950 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-100"><Eye className="h-4 w-4" /> Prévia da mensagem</div>
                {messagePreview(selectedTemplate, mappings).map((part) => (
                  <p key={`${part.type}:${part.text}`} className="whitespace-pre-wrap text-sm text-slate-200"><span className="mr-2 text-xs uppercase text-slate-400">{part.type}</span>{part.text}</p>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className={`${cardClass} space-y-4`}>
          <div><h2 className="font-semibold text-foreground">3. Teste e confirmação</h2><p className="text-sm text-muted-foreground">O teste usa somente o número informado e não inclui esse contato na campanha.</p></div>
          <div className="flex gap-2 rounded-lg bg-slate-950 p-1 text-sm">
            <button type="button" onClick={() => setTestMode("manual")} className={`rounded-md px-3 py-1.5 ${testMode === "manual" ? "bg-slate-700 text-white" : "text-slate-300"}`}>Inserir manualmente</button>
            <button type="button" onClick={() => setTestMode("contact")} className={`rounded-md px-3 py-1.5 ${testMode === "contact" ? "bg-slate-700 text-white" : "text-slate-300"}`}>Selecionar contato cadastrado</button>
          </div>
          {testMode === "contact" && <label className="block max-w-2xl text-sm text-slate-100">Contato cadastrado<select className={`${inputClass} mt-1`} value={testContactId} onChange={(event) => setTestContactId(event.target.value)}><option value="">Selecione</option>{contacts.filter((contact) => contact.addresses.some((address) => address.service === "whatsapp" && address.address)).map((contact) => <option key={contact.id} value={contact.id}>{contact.name || "Sem nome"} · {contact.addresses.find((address) => address.service === "whatsapp")?.address}</option>)}</select></label>}
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            {testMode === "manual" && <><input className={inputClass} value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="Nome do teste" /><input className={inputClass} value={testPhone} onChange={(event) => setTestPhone(event.target.value)} placeholder="WhatsApp com DDD" /></>}
            <button disabled={actions.createTest.isPending} className="flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm disabled:opacity-50" onClick={() => void sendTest()}>{actions.createTest.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Enviar teste</button>
            <button disabled={busy} className="flex items-center justify-center gap-2 rounded-lg bg-slate-100 px-5 py-2 text-sm font-medium text-slate-950 hover:bg-white disabled:opacity-50" onClick={() => void launch()}>{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} {scheduledAt ? "Agendar" : "Iniciar"} para {audienceCount.toLocaleString("pt-BR")}</button>
          </div>
          <label className="block max-w-md text-sm text-foreground">
            Agendar (opcional)
            <input className={`${inputClass} mt-1`} type="text" inputMode="numeric"
              placeholder="AAAA-MM-DDTHH:mm (horário de São Paulo)"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)} />
          </label>
          {notice && <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">{notice}</div>}
          <div className="flex items-start gap-2 text-xs text-slate-400"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-slate-200" />O backend reconfirma normalização, duplicidades, opt-outs e o limite total antes de enfileirar.</div>
        </section>

        <section className={`${cardClass} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="h-5 w-5" /><h2 className="font-semibold text-foreground">Acompanhamento em tempo real</h2></div><div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground"><label className="flex items-center gap-2"><input type="checkbox" checked={hideTests} onChange={(event) => setHideTests(event.target.checked)} /> Ocultar testes</label><label className="flex items-center gap-2"><input type="checkbox" checked={hideCancelled} onChange={(event) => setHideCancelled(event.target.checked)} /> Ocultar cancelados</label></div></div>
          {campaignsLoading ? <div className="text-sm text-muted-foreground">Carregando campanhas...</div> : !(campaigns ?? []).filter((campaign) => (!hideTests || !campaign.name.toLocaleLowerCase("pt-BR").includes("teste")) && (!hideCancelled || !["cancelled", "cancel_requested"].includes(campaign.status))).length ? <div className="text-sm text-muted-foreground">Nenhuma campanha para exibir.</div> : campaigns?.filter((campaign) => (!hideTests || !campaign.name.toLocaleLowerCase("pt-BR").includes("teste")) && (!hideCancelled || !["cancelled", "cancel_requested"].includes(campaign.status))).map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} onCancel={() => actions.cancelCampaign.mutate(campaign.id)} />)}
        </section>
      </div>
    </main>
  );
}
