import { useProjects } from "@/queries/useProjects";

export default function ProjectSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (projectIds: string[]) => void;
}) {
  const { data: projects = [] } = useProjects();

  return (
    <label>
      <div className="label">Projetos</div>
      <select
        multiple
        className="text min-h-28 w-full"
        value={value}
        onChange={(event) =>
          onChange(
            Array.from(event.target.selectedOptions).map((option) => option.value),
          )
        }
      >
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        O acesso do expert é definido pelos projetos, independentemente das tags.
      </p>
    </label>
  );
}
