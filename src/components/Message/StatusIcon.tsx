import { type OutgoingStatus } from "@/supabase/client";
import { getHighestStatus, getStatusIcon } from "@/utils/MessageStatusUtils";

export default function StatusIcon(status: OutgoingStatus) {
  const highestStatus = getHighestStatus(status);
  const { icon, color } = getStatusIcon(highestStatus);
  const label = {
    pending: "Aguardando envio",
    held_for_quality_assessment: "Aguardando avaliação de qualidade",
    accepted: "Aceita pela Meta; aguardando confirmação de envio",
    sent: "Enviada",
    delivered: "Entregue",
    read: "Lida",
    failed: "Erro no envio",
  }[highestStatus];

  return (
    <svg
      className={
        `w-[16px] ml-[3px] ${color}` +
        (icon === "clock" ? " h-[15px]" : " h-[11px]")
      }
    >
      <title>{label}</title>
      <use href={`/icons.svg#msg-${icon}`} />
    </svg>
  );
}
