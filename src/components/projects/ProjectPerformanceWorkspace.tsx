import { useEffect, useMemo, useState } from "react";
import { BarChart3, FileUp, Plus, Save } from "lucide-react";
import useBoundStore from "@/stores/useBoundStore";
import { useTags } from "@/queries/useTags";
import {
  type ProjectPerformanceRow,
  useCheckProjectPerformanceDates,
  useProjectAliases,
  useProjectPerformance,
  useProjectMemberships,
  useProjectScope,
  useProjects,
  useProjectTags,
  useSaveProject,
  useSaveProjectAlias,
  useSaveProjectPerformance,
  useSetProjectTags,
  useSetProjectExperts,
} from "@/queries/useProjects";
import { parseProjectPerformanceImport, type PerformanceImportPreview } from "@/utils/ProjectPerformanceImportUtils";
import { useCurrentAgents } from "@/queries/useAgents";

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;
const slugify = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export default function ProjectPerformanceWorkspace() {
  const orgId = useBoundStore((state) => state.ui.activeOrgId);
  const activeProjectId = useBoundStore((state) => state.ui.activeProjectId);
  const setActiveProject = useBoundStore((state) => state.ui.setActiveProject);
  const projectsQuery = useProjects();
  const { visibleProjects: projects, scopeKey, isAdmin } = useProjectScope();
  const { data: agents = [] } = useCurrentAgents();
  const { data: memberships = [] } = useProjectMemberships();
  const experts = agents.filter((agent) => !agent.ai && (agent.extra as { account_type?: string } | null)?.account_type === "expert");
  const [projectId, setProjectId] = useState<string>(activeProjectId ?? "");
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const project = projects.find((item) => item.id === projectId);
  const performance = useProjectPerformance(projectId, from, to);
  const projectTags = useProjectTags(projectId);
  const aliases = useProjectAliases(projectId);
  const tags = useTags();
  const saveProject = useSaveProject();
  const setProjectTags = useSetProjectTags();
  const setProjectExperts = useSetProjectExperts();
  const savePerformance = useSaveProjectPerformance();
  const saveAlias = useSaveProjectAlias();
  const checkPerformanceDates = useCheckProjectPerformanceDates();
  const [editingProject, setEditingProject] = useState({ name: "", description: "", budget: "0" });
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedExpertIds, setSelectedExpertIds] = useState<string[]>([]);
  const [alias, setAlias] = useState("");
  const [manual, setManual] = useState({ metric_date: today, spend: "0", leads: "0", group_joins: "0", reach: "0", notes: "" });
  const [preview, setPreview] = useState<PerformanceImportPreview | null>(null);
  const [previewExistingDates, setPreviewExistingDates] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<"replace" | "ignore">("replace");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const nextProjectId = activeProjectId && projects.some((item) => item.id === activeProjectId)
      ? activeProjectId
      : projects.some((item) => item.id === projectId)
        ? projectId
        : projects[0]?.id ?? "";
    setProjectId(nextProjectId);
    setPreview(null);
    setPreviewExistingDates([]);
  }, [scopeKey, activeProjectId, projects.map((item) => item.id).join(",")]);

  useEffect(() => {
    if (orgId && projectId) {
      localStorage.setItem(`openbsp-active-project-${orgId}`, projectId);
    }
  }, [orgId, projectId]);

  useEffect(() => {
    if (!project) {
      setEditingProject({ name: "", description: "", budget: "0" });
      setSelectedTagIds([]);
      return;
    }
    setEditingProject({ name: project.name, description: project.description ?? "", budget: String(project.planned_budget) });
  }, [project]);

  useEffect(() => setSelectedTagIds(projectTags.data ?? []), [projectTags.data]);
  useEffect(() => setSelectedExpertIds(
    memberships.filter((membership) => membership.project_id === projectId && membership.role === "expert").map((membership) => membership.agent_id),
  ), [memberships, projectId]);

  const totals = useMemo(() => (performance.data ?? []).reduce((acc, row) => ({
    spend: acc.spend + Number(row.spend), leads: acc.leads + row.leads,
    group_joins: acc.group_joins + row.group_joins, reach: acc.reach + row.reach,
  }), { spend: 0, leads: 0, group_joins: 0, reach: 0 }), [performance.data]);
  const remaining = Math.max(0, Number(project?.planned_budget ?? 0) - totals.spend);
  const existingDates = new Set(previewExistingDates);
  const previewInserts = preview?.rows.filter((row) => !existingDates.has(row.metric_date)).length ?? 0;
  const previewUpdates = preview?.rows.filter((row) => existingDates.has(row.metric_date)).length ?? 0;

  const persistRows = async (
    rows: Array<Omit<ProjectPerformanceRow, "id" | "organization_id" | "project_id">>,
    mode: "replace" | "ignore" = "replace",
  ) => {
    if (!projectId) return;
    await savePerformance.mutateAsync({ projectId, rows, mode });
    setMessage("Dados salvos com sucesso.");
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-5 text-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">Projetos e performance</h1><p className="text-sm text-muted-foreground">Tráfego pago por projeto, separado das campanhas de WhatsApp.</p></div>
          <select className="text min-w-64" value={projectId} onChange={(event) => { setProjectId(event.target.value); setActiveProject(event.target.value || null); setPreview(null); setPreviewExistingDates([]); }}>
            <option value="">Selecione um projeto</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </header>

        {isAdmin ? <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">Projeto</h2>
          <div className="grid gap-3 md:grid-cols-4">
            <input className="text" placeholder="Nome do projeto" value={editingProject.name} onChange={(e) => setEditingProject((value) => ({ ...value, name: e.target.value }))} />
            <input className="text" placeholder="Descrição" value={editingProject.description} onChange={(e) => setEditingProject((value) => ({ ...value, description: e.target.value }))} />
            <input className="text" type="number" min="0" step="0.01" placeholder="Orçamento planejado" value={editingProject.budget} onChange={(e) => setEditingProject((value) => ({ ...value, budget: e.target.value }))} />
            <button className="primary flex items-center justify-center gap-2 px-4" disabled={!editingProject.name.trim() || saveProject.isPending} onClick={async () => {
              const saved = await saveProject.mutateAsync({ id: project?.id, name: editingProject.name.trim(), slug: project?.slug ?? slugify(editingProject.name), description: editingProject.description.trim() || null, planned_budget: Number(editingProject.budget) || 0 });
              setProjectId(saved.id); setMessage(project ? "Projeto atualizado." : "Projeto criado.");
            }}>{project ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{project ? "Salvar projeto" : "Criar projeto"}</button>
          </div>
          {project && <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-sm">Tags associadas
              <select multiple className="text mt-1 min-h-28 w-full" value={selectedTagIds} onChange={(event) => setSelectedTagIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
                {(tags.data ?? []).map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
              </select>
              <button className="mt-2 rounded-lg border border-border px-3 py-2" onClick={() => setProjectTags.mutate({ projectId, tagIds: selectedTagIds })}>Aplicar tags ao projeto</button>
            </label>
            <div className="text-sm">Aliases de importação
              <div className="mt-1 flex gap-2"><input className="text grow" value={alias} placeholder="Nome/ID da campanha no arquivo" onChange={(e) => setAlias(e.target.value)} /><button className="rounded-lg border border-border px-3" disabled={!alias.trim()} onClick={async () => { await saveAlias.mutateAsync({ projectId, alias }); setAlias(""); }}>Adicionar</button></div>
              <div className="mt-2 flex flex-wrap gap-2">{(aliases.data ?? []).map((item) => <span className="rounded-full bg-muted px-3 py-1" key={item.id}>{item.alias}</span>)}</div>
            </div>
            <label className="text-sm">Experts com acesso (opcional)
              <select multiple className="text mt-1 min-h-28 w-full" value={selectedExpertIds} onChange={(event) => setSelectedExpertIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
                {experts.map((expert) => <option key={expert.id} value={expert.id}>{expert.name || "Expert sem nome"}</option>)}
              </select>
              <button className="mt-2 rounded-lg border border-border px-3 py-2" onClick={() => setProjectExperts.mutate({ projectId, expertIds: selectedExpertIds })}>Salvar experts</button>
              <p className="mt-1 text-xs text-muted-foreground">O projeto pode permanecer sem expert associado.</p>
            </label>
          </div>}
        </section> : project ? <section className="rounded-xl border border-border bg-card p-4"><h2 className="font-semibold">{project.name}</h2><p className="text-sm text-muted-foreground">{project.description || "Sem descrição"}</p></section> : null}

        {project && <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[['Orçamento', money.format(project.planned_budget)], ['Gasto', money.format(totals.spend)], ['Saldo', money.format(remaining)], ['Leads', totals.leads], ['CPL', totals.leads ? money.format(totals.spend / totals.leads) : '—']].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-border bg-card p-4"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>)}
          </section>

          {isAdmin && <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-semibold">Período</h2><p className="text-xs text-muted-foreground">Entradas no grupo permanecem editáveis manualmente.</p></div><div className="flex gap-2"><label className="text-xs">De<input className="text block" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="text-xs">Até<input className="text block" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div></div>
            <div className="grid gap-2 md:grid-cols-7">
              <input className="text" type="date" value={manual.metric_date} onChange={(e) => setManual((v) => ({ ...v, metric_date: e.target.value }))} />
              {([['spend','Gasto'],['leads','Leads'],['group_joins','No grupo'],['reach','Alcance']] as const).map(([key, label]) => <input key={key} className="text" type="number" min="0" step={key === 'spend' ? '0.01' : '1'} placeholder={label} value={manual[key]} onChange={(e) => setManual((v) => ({ ...v, [key]: e.target.value }))} />)}
              <input className="text" placeholder="Observações" value={manual.notes} onChange={(e) => setManual((v) => ({ ...v, notes: e.target.value }))} />
              <button className="primary flex items-center justify-center gap-2 px-3" onClick={() => persistRows([{ metric_date: manual.metric_date, spend: Number(manual.spend), leads: Number(manual.leads), group_joins: Number(manual.group_joins), reach: Number(manual.reach), notes: manual.notes.trim() || null }])}><Save className="h-4 w-4" />Salvar dia</button>
            </div>
          </section>}

          {isAdmin && <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><FileUp className="h-4 w-4" />Importar CSV/XLSX</h2>
            <input type="file" accept=".csv,.xlsx" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const parsed = await parseProjectPerformanceImport(file, project, (aliases.data ?? []).map((item) => item.alias)); setPreview(parsed); setPreviewExistingDates(await checkPerformanceDates.mutateAsync({ projectId, dates: parsed.rows.map((row) => row.metric_date) })); }} />
            {preview && <div className="mt-3 rounded-lg bg-muted p-3 text-sm"><div>{preview.considered} linhas consideradas · {preview.ignored} ignoradas · {preview.invalid} rejeitadas</div><div>{previewInserts} datas novas · {previewUpdates} datas existentes</div>{!preview.hasProjectColumn && <p className="mt-1 text-amber-500">O arquivo não possui coluna de projeto/campanha; todas as linhas válidas foram consideradas.</p>}{preview.issues.length > 0 && <details className="mt-2"><summary className="cursor-pointer">Ver linhas ignoradas/rejeitadas</summary><ul className="mt-1 max-h-40 overflow-y-auto pl-5">{preview.issues.slice(0, 50).map((issue) => <li key={`${issue.row}-${issue.kind}`}>Linha {issue.row}: {issue.reason}</li>)}</ul>{preview.issues.length > 50 && <p>Mostrando as primeiras 50 ocorrências.</p>}</details>}<div className="mt-2 flex gap-3"><select className="text" value={importMode} onChange={(e) => setImportMode(e.target.value as 'replace' | 'ignore')}><option value="replace">Substituir datas existentes</option><option value="ignore">Ignorar datas existentes</option></select><button className="primary px-4" disabled={!preview.rows.length || checkPerformanceDates.isPending} onClick={() => persistRows(preview.rows, importMode)}>Confirmar importação</button></div></div>}
          </section>}

          <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="flex items-center gap-2 border-b border-border p-4 font-semibold"><BarChart3 className="h-4 w-4" />Tabela diária</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted text-left"><tr>{['Data','Gasto','Leads','No grupo','Alcance','CPL','Observações'].map((item) => <th key={item} className="px-3 py-2">{item}</th>)}</tr></thead><tbody>{(performance.data ?? []).map((row) => <tr className="border-t border-border" key={row.id}><td className="px-3 py-2">{row.metric_date}</td><td className="px-3 py-2">{money.format(row.spend)}</td><td className="px-3 py-2">{row.leads}</td><td className="px-3 py-2">{row.group_joins}</td><td className="px-3 py-2">{row.reach}</td><td className="px-3 py-2">{row.leads ? money.format(row.spend / row.leads) : '—'}</td><td className="px-3 py-2">{row.notes || '—'}</td></tr>)}</tbody></table></div></section>
        </>}
        {(message || projectsQuery.error || saveProject.error || savePerformance.error) && <p className="text-sm">{message || String(projectsQuery.error || saveProject.error || savePerformance.error)}</p>}
      </div>
    </div>
  );
}
