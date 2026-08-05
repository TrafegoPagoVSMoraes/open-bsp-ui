import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Eye,
  Link2,
  MousePointerClick,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  useTrackingDashboard,
  useTrackingProjects,
} from "@/queries/useTracking";
import { useTranslation } from "@/hooks/useTranslation";

function dateRange(days: number) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86_400_000);
  return { from: from.toISOString(), to: to.toISOString() };
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
      }).format(date);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(undefined, {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: typeof Activity;
  tone: string;
}) {
  return (
    <div className="rounded-[16px] border border-border bg-card p-[18px] shadow-sm">
      <div className="flex items-start justify-between gap-[12px]">
        <div>
          <p className="text-[13px] text-muted-foreground">{label}</p>
          <p className="mt-[6px] text-[28px] font-semibold tracking-[-0.03em]">
            {value}
          </p>
        </div>
        <div className={`rounded-[12px] p-[10px] ${tone}`}>
          <Icon className="h-[20px] w-[20px]" />
        </div>
      </div>
      <p className="mt-[10px] text-[12px] text-muted-foreground">{helper}</p>
    </div>
  );
}

export default function StatsTracking() {
  const { translate: t } = useTranslation();
  const [days, setDays] = useState(30);
  const range = useMemo(() => dateRange(days), [days]);
  const projects = useTrackingProjects();
  const [projectId, setProjectId] = useState<string | null>(null);
  const dashboard = useTrackingDashboard(projectId, range.from, range.to);

  useEffect(() => {
    if (
      projectId &&
      !projects.data?.some((project) => project.id === projectId)
    )
      setProjectId(null);
  }, [projectId, projects.data]);

  const data = dashboard.data;
  const summary = data?.summary;

  return (
    <div className="flex w-full flex-col gap-[24px] overflow-y-auto p-[24px]">
      <div className="flex flex-wrap items-end justify-between gap-[16px]">
        <div>
          <div className="flex items-center gap-[10px]">
            <div className="rounded-[12px] bg-emerald-500/10 p-[9px] text-emerald-600">
              <BarChart3 className="h-[21px] w-[21px]" />
            </div>
            <div>
              <h2 className="text-[20px] font-semibold">{t("Rastreamento")}</h2>
              <p className="text-[13px] text-muted-foreground">
                {t("Visão geral de acessos, cliques e conversões")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-[10px]">
          <label className="flex flex-col gap-[4px] text-[11px] text-muted-foreground">
            {t("Projeto")}
            <select
              className="h-[38px] min-w-[190px] rounded-[10px] border border-border bg-background px-[10px] text-[13px] text-foreground"
              value={projectId ?? ""}
              onChange={(event) => setProjectId(event.target.value || null)}
            >
              <option value="">{t("Todos os projetos")}</option>
              {projects.data?.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-[4px] text-[11px] text-muted-foreground">
            {t("Período")}
            <select
              className="h-[38px] rounded-[10px] border border-border bg-background px-[10px] text-[13px] text-foreground"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>{t("7 dias")}</option>
              <option value={30}>{t("30 dias")}</option>
              <option value={90}>{t("90 dias")}</option>
            </select>
          </label>
        </div>
      </div>

      {projects.isError || dashboard.isError ? (
        <div className="rounded-[14px] border border-destructive/30 bg-destructive/5 p-[16px] text-[13px] text-destructive">
          {t("Não foi possível carregar os dados de rastreamento.")}
        </div>
      ) : null}

      {!projects.isLoading && projects.data?.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border bg-muted/20 p-[28px] text-center">
          <Link2 className="mx-auto h-[28px] w-[28px] text-muted-foreground" />
          <h3 className="mt-[10px] text-[15px] font-medium">
            {t("Nenhum projeto de rastreamento configurado")}
          </h3>
          <p className="mx-auto mt-[6px] max-w-[520px] text-[13px] text-muted-foreground">
            {t(
              "Crie um projeto pela API de gestão e instale o coletor na sua página independente.",
            )}
          </p>
        </div>
      ) : null}

      <div className="grid gap-[14px] sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("Links rastreados")}
          value={(summary?.tracked_links ?? 0).toLocaleString()}
          helper={`${summary?.opened_links ?? 0} ${t("links acessados")}`}
          icon={Link2}
          tone="bg-sky-500/10 text-sky-600"
        />
        <MetricCard
          label={t("Visitantes únicos")}
          value={(summary?.unique_visitors ?? 0).toLocaleString()}
          helper={`${summary?.page_views ?? 0} ${t("visualizações de página")}`}
          icon={Users}
          tone="bg-violet-500/10 text-violet-600"
        />
        <MetricCard
          label={t("Cliques")}
          value={(summary?.clicks ?? 0).toLocaleString()}
          helper={`${summary?.events ?? 0} ${t("eventos no total")}`}
          icon={MousePointerClick}
          tone="bg-amber-500/10 text-amber-600"
        />
        <MetricCard
          label={t("Conversões")}
          value={(summary?.conversions ?? 0).toLocaleString()}
          helper={`${(summary?.open_rate ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}% ${t("de abertura")}`}
          icon={CheckCircle2}
          tone="bg-emerald-500/10 text-emerald-600"
        />
      </div>

      <div className="grid gap-[16px] xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="rounded-[16px] border border-border bg-card p-[18px] shadow-sm">
          <div className="mb-[16px] flex items-center justify-between">
            <div>
              <h3 className="text-[15px] font-medium">
                {t("Evolução diária")}
              </h3>
              <p className="text-[12px] text-muted-foreground">
                {t("Aberturas, visualizações, cliques e conversões")}
              </p>
            </div>
            <Eye className="h-[18px] w-[18px] text-muted-foreground" />
          </div>
          <div className="h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDate}
                  tick={{ fontSize: 11 }}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={(value) => formatDate(String(value))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="opens"
                  name={t("Aberturas")}
                  stroke="#0ea5e9"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="page_views"
                  name={t("Visualizações")}
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="clicks"
                  name={t("Cliques")}
                  stroke="#f59e0b"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="conversions"
                  name={t("Conversões")}
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="rounded-[16px] border border-border bg-card p-[18px] shadow-sm">
          <h3 className="text-[15px] font-medium">{t("Eventos principais")}</h3>
          <p className="mb-[12px] text-[12px] text-muted-foreground">
            {t("Ações mais frequentes no período")}
          </p>
          <div className="flex flex-col gap-[8px]">
            {data?.top_events.map((event, index) => (
              <div
                key={`${event.event_type}:${event.event_name}`}
                className="flex items-center gap-[10px] rounded-[10px] bg-muted/35 px-[10px] py-[9px]"
              >
                <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-background text-[11px] font-medium text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {event.event_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {event.event_type}
                  </p>
                </div>
                <span className="text-[13px] font-semibold">{event.total}</span>
              </div>
            ))}
            {!data?.top_events.length ? (
              <p className="py-[32px] text-center text-[13px] text-muted-foreground">
                {t("Sem eventos no período")}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="rounded-[16px] border border-border bg-card shadow-sm">
        <div className="border-b border-border px-[18px] py-[14px]">
          <h3 className="text-[15px] font-medium">{t("Atividade recente")}</h3>
          <p className="text-[12px] text-muted-foreground">
            {t("Os contatos aparecem mascarados; nenhum token é exibido.")}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-[12px]">
            <thead className="bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-[18px] py-[10px] font-medium">
                  {t("Horário")}
                </th>
                <th className="px-[12px] py-[10px] font-medium">
                  {t("Evento")}
                </th>
                <th className="px-[12px] py-[10px] font-medium">
                  {t("Elemento")}
                </th>
                <th className="px-[12px] py-[10px] font-medium">
                  {t("Página")}
                </th>
                <th className="px-[18px] py-[10px] text-right font-medium">
                  {t("Contato")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.recent_activity.map((activity) => (
                <tr
                  key={activity.event_id}
                  className="border-t border-border/70"
                >
                  <td className="whitespace-nowrap px-[18px] py-[11px] text-muted-foreground">
                    {formatTimestamp(activity.occurred_at)}
                  </td>
                  <td className="px-[12px] py-[11px]">
                    <span className="rounded-full bg-primary/8 px-[8px] py-[4px] font-medium text-primary">
                      {activity.event_name}
                    </span>
                  </td>
                  <td className="px-[12px] py-[11px] text-muted-foreground">
                    {activity.element_id ?? "—"}
                  </td>
                  <td className="max-w-[220px] truncate px-[12px] py-[11px] text-muted-foreground">
                    {activity.page_path ?? "—"}
                  </td>
                  <td className="px-[18px] py-[11px] text-right font-mono">
                    {activity.contact_address_masked ?? t("Anônimo")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.recent_activity.length ? (
            <div className="py-[36px] text-center text-[13px] text-muted-foreground">
              {dashboard.isLoading
                ? t("Carregando…")
                : t("Nenhuma atividade recente")}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
