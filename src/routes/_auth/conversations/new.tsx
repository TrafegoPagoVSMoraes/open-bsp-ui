import { createFileRoute, useNavigate } from "@tanstack/react-router";
import useBoundStore from "@/stores/useBoundStore";
import { Search, X, MessageSquarePlus, MessageCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { startConversation } from "@/utils/ConversationUtils";
import { useState } from "react";
import { formatPhoneNumber } from "@/utils/FormatUtils";
import SectionHeader from "@/components/SectionHeader";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import SectionItem from "@/components/SectionItem";
import SectionBody from "@/components/SectionBody";

export const Route = createFileRoute("/_auth/conversations/new")({
  component: NewChat,
});

function NewChat() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: addresses } = useOrganizationsAddresses();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  const localAddress = addresses?.find(
    (address) => address.service === "local",
  );

  const whatsappAddresses = addresses?.filter(
    (address) => address.service === "whatsapp",
  );

  const [phoneNumber, setPhoneNumber] = useState("");

  function sanitizePhoneNumber(phone: string): string {
    const digits = phone.replace(/\D/g, "");
    if (!digits) return "";
    // Preserve a caller-provided country code. Default local input to Brazil.
    if (digits.startsWith("55") || digits.startsWith("54")) return digits;
    return `55${digits}`;
  }

  return (
    <div className="flex flex-col h-full">
      <SectionHeader title={t("Nueva conversación")} />

      <div className="px-[20px] pb-[12px] flex">
        <div className="flex items-center w-full bg-incoming-chat-bubble h-[40px] rounded-full hover:ring ring-border px-[12px] text-foreground">
          <Search className="text-muted-foreground w-[16px] h-[16px] stroke-[3px] shrink-0" />
          <input
            placeholder={t("Buscar nombre o número de teléfono")}
            className="bg-transparent border-none outline-none w-full h-full text-[15px] mx-[12px] placeholder:text-muted-foreground"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
          {phoneNumber && (
            <X
              className="cursor-pointer text-muted-foreground w-[16px] h-[16px] stroke-[3px]"
              onClick={() => setPhoneNumber("")}
            />
          )}
        </div>
      </div>

      <SectionBody>
        {localAddress && (
          <SectionItem
            title={t("Nueva conversación de prueba")}
            aside={
              <div className="p-[8px] bg-primary/10 rounded-full">
                <MessageSquarePlus className="w-[24px] h-[24px] text-primary" />
              </div>
            }
            onClick={() => {
              if (!activeOrgId) {
                return;
              }

              const convId = startConversation({
                name: t("Conversación de prueba"),
                organization_id: activeOrgId,
                organization_address: localAddress.address,
                service: "local",
              });

              //setActiveConv(convId!);
              navigate({ to: "/conversations", hash: convId });
            }}
          />
        )}

        {!!whatsappAddresses?.length &&
          phoneNumber.replace(/\D/g, "").length >= 10 && (
            <SectionItem
              title={formatPhoneNumber(sanitizePhoneNumber(phoneNumber))}
              aside={
                <div className="p-[8px] bg-primary/10 rounded-full">
                  <MessageCircle className="w-[24px] h-[24px] text-primary" />
                </div>
              }
              onClick={() => {
                if (!activeOrgId) return;

                const convId = startConversation({
                  organization_id: activeOrgId,
                  organization_address: whatsappAddresses[0].address,
                  contact_address: sanitizePhoneNumber(phoneNumber),
                  service: "whatsapp",
                  name: formatPhoneNumber(sanitizePhoneNumber(phoneNumber)),
                });

                // setActiveConv(convId!);
                navigate({ to: "/conversations", hash: convId });
              }}
            />
          )}
      </SectionBody>
    </div>
  );
}
