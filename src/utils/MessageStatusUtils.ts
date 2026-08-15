import { type OutgoingStatus } from "@/supabase/client";

const outgoingStatusHierarchy = [
  "pending",
  "held_for_quality_assessment",
  "accepted",
  "sent",
  "delivered",
  "read",
  "failed",
] as const;

/**
 * From a status object determine based on the hierarchy created by the objects
 * above which his the highest status that the object has in it.
 * @param status
 * @returns
 */
export function getHighestStatus(
  status: OutgoingStatus,
): (typeof outgoingStatusHierarchy)[number] {
  if (!status) {
    return "pending";
  }

  // A retry can preserve an earlier `failed` timestamp while a later request
  // is accepted by WhatsApp. A confirmed success must win in that case; an
  // error is only final when no success status exists.
  for (const level of ["read", "delivered", "sent", "accepted"] as const) {
    if (level in status) {
      return level;
    }
  }

  if ("failed" in status) {
    return "failed";
  }

  for (const level of ["held_for_quality_assessment", "pending"] as const) {
    if (level in status) {
      return level;
    }
  }

  return "pending";
}

/**
 * For a given status string return the corresponding icon and color to be applied
 * @param status
 * @returns { icon: string, color: string }
 */
export function getStatusIcon(
  status: (typeof outgoingStatusHierarchy)[number],
): {
  icon: string;
  color: string;
} {
  switch (status) {
    case "pending":
    case "held_for_quality_assessment":
    case "accepted":
      return {
        icon: "clock",
        color: "",
      };
    case "sent":
      return {
        icon: "check",
        color: "",
      };
    case "delivered":
      return {
        icon: "double-check",
        color: "",
      };
    case "read":
      return {
        icon: "double-check",
        color: "text-primary",
      };
    case "failed":
      return {
        icon: "x",
        color: "text-destructive",
      };
    default:
      return { icon: "", color: "" };
  }
}

/*
const markMessagesAsRead = async (ids: string[]) => {
  const promises = ids.map(async (id) => {
    const { error } = await MessageService.updateIncomingMessage(id, {
      status: {
        read: dayjs().toISOString(),
      },
    });

    if (error) {
      console.error(`Could not mark as read incoming message with id ${id}`);
      throw error;
    }
  });

  const responses = await Promise.all(promises);
};
*/
