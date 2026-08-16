import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import { useCurrentAgent, useCurrentAgents } from "@/queries/useAgents";
import { useProjectMemberships, useProjects } from "@/queries/useProjects";
import { useExpertManagement, type ExpertManagementInput } from "@/queries/useExperts";
import type { AgentRow } from "@/supabase/client";

export const Route = createFileRoute("/_auth/settings/experts/")({ component: ExpertsSettings });

type ExpertExtra = {
  account_type?: string;
  email?: string;
  invitation?: { email?: string; status?: string };
};

function ExpertCard({ expert, initialProjectIds, projects }: {
  expert: AgentRow;
  initialProjectIds: string[];
  projects: Array<{ id: string; name: string }>;
}) {
  const management = useExpertManagement();
  const extra = (expert.extra ?? {}) as ExpertExtra;
  const [name, setName] = useState(expert.name ?? "");
  const [email, setEmail] = useState(extra.invitation?.email ?? extra.email ?? "");
  const [projectIds, setProjectIds] = useState(initialProjectIds);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const hasAccess =
    !!expert.user_id && extra.invitation?.status === "accepted";

  useEffect(() => setProjectIds(initialProjectIds), [initialProjectIds]);

  const execute = async (input: ExpertManagementInput, success: string) => {
    setMessage("");
    try {
      await management.mutateAsync(input);
      setPassword("");
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    }
  };

  return <div className="rounded-xl border border-border p-4">
    <div className="mb-3 flex items-center justify-between gap-3">
      <div><div className="font-medium">{expert.name || "Expert sem nome"}</div><div className="text-sm text-muted-foreground">{hasAccess ? "Acesso ativo" : extra.invitation?.status === "pending" ? "Convite pendente" : "Sem acesso"}</div></div>
      <span className={`rounded-full px-2 py-1 text-xs ${hasAccess ? "bg-emerald-500/15 text-emerald-500" : "bg-amber-500/15 text-amber-500"}`}>{hasAccess ? "Ativo" : "Cadastro preliminar"}</span>
    </div>
    <div className="grid gap-2">
      <input className="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome" />
      <input className="text" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail (opcional até ativar)" />
      <label className="text-sm">Projetos permitidos
        <select multiple className="text mt-1 min-h-24 w-full" value={projectIds} onChange={(event) => setProjectIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
      </label>
      <button className="rounded-lg border border-border px-3 py-2" disabled={!name.trim() || management.isPending} onClick={() => execute({ action: "update", expert_id: expert.id, name: name.trim(), email: email.trim() || null, project_ids: projectIds }, "Expert atualizado.")}>Salvar cadastro e acessos</button>
      <div className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input className="text" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={hasAccess ? "Nova senha" : "Senha inicial"} />
        {!hasAccess && <button className="rounded-lg border border-border px-3 py-2" disabled={!email.trim() || management.isPending} onClick={() => execute({ action: "activate", mode: "invite", expert_id: expert.id, name: name.trim(), email: email.trim(), project_ids: projectIds }, "Convite enviado.")}>Enviar convite</button>}
        <button className="primary px-3 py-2" disabled={!email.trim() || password.length < 8 || management.isPending} onClick={() => execute(hasAccess ? { action: "set_password", expert_id: expert.id, password } : { action: "activate", mode: "password", expert_id: expert.id, name: name.trim(), email: email.trim(), password, project_ids: projectIds }, hasAccess ? "Senha atualizada." : "Acesso ativado.")}>{hasAccess ? "Alterar senha" : "Ativar com senha"}</button>
      </div>
      <p className="text-xs text-muted-foreground">A senha não é persistida; ela é enviada diretamente ao Supabase Auth.</p>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </div>;
}

function ExpertsSettings() {
  const { data: currentAgent } = useCurrentAgent();
  const { data: agents = [] } = useCurrentAgents();
  const { data: projects = [] } = useProjects();
  const { data: memberships = [] } = useProjectMemberships();
  const management = useExpertManagement();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const isAdmin = ["admin", "owner"].includes(currentAgent?.extra?.role ?? "");
  const experts = useMemo(() => agents.filter((agent) => !agent.ai && ((agent.extra ?? {}) as ExpertExtra).account_type === "expert"), [agents]);

  if (!isAdmin) return <><SectionHeader title="Experts" /><SectionBody><p className="text-sm text-muted-foreground">Somente administradores podem gerenciar experts.</p></SectionBody></>;

  return <><SectionHeader title="Experts" /><SectionBody className="gap-5">
    <div className="rounded-xl border border-border p-4">
      <h2 className="font-semibold">Cadastrar expert</h2>
      <p className="mb-3 text-sm text-muted-foreground">Crie primeiro o cadastro. E-mail, convite e senha podem ser definidos depois.</p>
      <div className="flex gap-2"><input className="text grow" placeholder="Nome" value={name} onChange={(event) => setName(event.target.value)} /><button className="primary px-4 py-2" disabled={!name.trim() || management.isPending} onClick={async () => {
        setMessage("");
        try { await management.mutateAsync({ action: "create", name: name.trim() }); setName(""); setMessage("Expert cadastrado sem acesso. Complete os dados abaixo quando quiser ativá-lo."); }
        catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível cadastrar."); }
      }}>Criar cadastro</button></div>
      {message && <p className="mt-2 text-sm text-muted-foreground">{message}</p>}
    </div>
    <div className="flex flex-col gap-3">{experts.map((expert) => <ExpertCard key={expert.id} expert={expert} projects={projects} initialProjectIds={memberships.filter((item) => item.agent_id === expert.id).map((item) => item.project_id)} />)}</div>
  </SectionBody></>;
}
