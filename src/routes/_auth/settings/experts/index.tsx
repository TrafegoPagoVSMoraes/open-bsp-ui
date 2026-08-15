import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import SectionHeader from "@/components/SectionHeader";
import SectionBody from "@/components/SectionBody";
import { useCurrentAgents } from "@/queries/useAgents";
import { useCurrentOrganization } from "@/queries/useOrganizations";
import { useProjectMemberships, useProjects, useSetExpertProjects } from "@/queries/useProjects";
import { supabase } from "@/supabase/client";

export const Route = createFileRoute("/_auth/settings/experts/")({ component: ExpertsSettings });

function ExpertsSettings() {
  const { data: agents = [] } = useCurrentAgents();
  const { data: projects = [] } = useProjects();
  const { data: memberships = [] } = useProjectMemberships();
  const { data: organization } = useCurrentOrganization();
  const setExpertProjects = useSetExpertProjects();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<Record<string, string[]>>({});
  const [isInviting, setIsInviting] = useState(false);
  const [message, setMessage] = useState("");
  const experts = useMemo(
    () => agents.filter((agent) => !agent.ai && (agent.extra as any)?.account_type === "expert"),
    [agents],
  );

  return <><SectionHeader title="Experts" /><SectionBody className="gap-5">
    <div className="rounded-xl border border-border p-4">
      <h2 className="font-semibold">Convidar expert</h2>
      <p className="mb-3 text-sm text-muted-foreground">O convite usa Supabase Auth. Nenhuma senha é armazenada nas tabelas da aplicação.</p>
      <div className="flex flex-col gap-2">
        <input className="text" placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="text" type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <select multiple className="text min-h-28" value={projectIds} onChange={(event) => setProjectIds(Array.from(event.target.selectedOptions).map((option) => option.value))}>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <button className="primary px-4 py-2" disabled={!name.trim() || !email.trim() || !organization?.id || isInviting} onClick={async () => {
          setIsInviting(true); setMessage("");
          const { data, error } = await supabase.functions.invoke("expert-management", {
            method: "POST",
            body: { organization_id: organization?.id, name: name.trim(), email: email.trim(), project_ids: projectIds },
          });
          setIsInviting(false);
          if (error || data?.error) { setMessage("Não foi possível enviar o convite."); return; }
          await queryClient.invalidateQueries();
          setName(""); setEmail(""); setProjectIds([]); setMessage("Convite enviado.");
        }}>Enviar convite</button>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
    <div className="flex flex-col gap-3">{experts.map((expert) => {
      const selected = editing[expert.id] ?? memberships.filter((item) => item.agent_id === expert.id).map((item) => item.project_id);
      return <div key={expert.id} className="rounded-xl border border-border p-4"><div className="font-medium">{expert.name}</div><div className="text-sm text-muted-foreground">{(expert.extra as any)?.invitation?.email ?? "Usuário autenticado"}</div><select multiple className="text mt-3 min-h-24 w-full" value={selected} onChange={(event) => setEditing((value) => ({ ...value, [expert.id]: Array.from(event.target.selectedOptions).map((option) => option.value) }))}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className="mt-2 rounded-lg border border-border px-3 py-2" onClick={() => setExpertProjects.mutate({ agentId: expert.id, projectIds: selected })}>Salvar acessos</button></div>;
    })}</div>
  </SectionBody></>;
}
