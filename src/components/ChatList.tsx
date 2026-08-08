import useBoundStore from "@/stores/useBoundStore";
import ChatListItem from "./ChatListItem";
import { type ConversationRow, type MessageRow } from "@/supabase/client";
import { timestampDescending } from "@/stores/chatSlice";
import { filters, Filters } from "@/stores/uiSlice";
import Fuse from "fuse.js";
import { useTranslation } from "@/hooks/useTranslation";
import { supabase } from "@/supabase/client";
import { useState } from "react";
import Spinner from "./Spinner";

export type ConvMetadata = {
  convId: string;
  conv: ConversationRow;
  mostRecentMsg?: MessageRow;
};

type InitDataResponse = {
  conversations: ConversationRow[];
  messages: MessageRow[];
};

const CONVERSATION_HISTORY_PAGE_SIZE = 100;

function getOldestTimestamp(messages: MessageRow[]): string | null {
  return messages.reduce<string | null>(
    (oldest, message) =>
      !oldest || message.timestamp < oldest ? message.timestamp : oldest,
    null,
  );
}

function pinnedAscending(a: ConversationRow, b: ConversationRow) {
  const aPin = a.extra?.pinned;
  const bPin = b.extra?.pinned;

  if (!aPin && !bPin) {
    return 0;
  }

  if (aPin && bPin) {
    return +new Date(aPin) > +new Date(bPin) ? 1 : -1;
  }

  return aPin && !bPin ? -1 : 1;
}

const ChatList = () => {
  const { translate: t } = useTranslation();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);
  const conversations = useBoundStore((state) => state.chat.conversations);
  const messages = useBoundStore((state) => state.chat.messages);
  const conversationHistoryCursor = useBoundStore(
    (state) => state.chat.conversationHistoryCursor,
  );
  const hasMoreConversationHistory = useBoundStore(
    (state) => state.chat.hasMoreConversationHistory,
  );
  const pushConversations = useBoundStore(
    (state) => state.chat.pushConversations,
  );
  const pushMessages = useBoundStore((state) => state.chat.pushMessages);
  const setConversationHistoryPagination = useBoundStore(
    (state) => state.chat.setConversationHistoryPagination,
  );
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const filterName = useBoundStore((state) => state.ui.filter);
  const setFilterName = useBoundStore((state) => state.ui.setFilter);
  const searchPattern = useBoundStore((state) => state.ui.searchPattern);
  const setSearchPattern = useBoundStore((state) => state.ui.setSearchPattern);

  function getMostRecentMsg(convId: string): MessageRow | undefined {
    return messages.get(convId)?.values().next().value;
  }

  let items: ConvMetadata[] = [...conversations]
    /*.filter(
      ([, conv]) =>
        role === "admin" || conv.service !== "local",
    )*/
    .map(([convId, conv]) => ({
      convId,
      conv,
      mostRecentMsg: getMostRecentMsg(convId),
    }))
    .filter(
      (a) =>
        a.conv.organization_id === activeOrgId &&
        filters[filterName](a.conv, a.mostRecentMsg) &&
        !!a.mostRecentMsg,
    );

  if (searchPattern) {
    const fuse = new Fuse(items, {
      threshold: 0.4,
      keys: ["conv.name", "conv.contact_address"],
    });
    items = fuse.search(searchPattern).map((r) => r.item);
  } else {
    items.sort(
      (a, b) =>
        pinnedAscending(a.conv, b.conv) ||
        timestampDescending(a.mostRecentMsg, b.mostRecentMsg),
    );
  }

  const itemIds = items.map((a) => a.convId);

  const loadOlderConversations = async () => {
    if (
      !activeOrgId ||
      !conversationHistoryCursor ||
      isLoadingHistory
    ) {
      return;
    }

    setIsLoadingHistory(true);

    try {
      const { data } = await supabase
        .rpc("init_data", {
          p_organization_id: activeOrgId,
          p_limit: CONVERSATION_HISTORY_PAGE_SIZE,
          p_per_conversation: 5,
          p_until: conversationHistoryCursor,
        })
        .throwOnError();

      const page = data as unknown as InitDataResponse;
      pushConversations(page.conversations);
      pushMessages(page.messages);
      setConversationHistoryPagination(
        getOldestTimestamp(page.messages),
        page.messages.length >= CONVERSATION_HISTORY_PAGE_SIZE,
      );
    } catch (error) {
      console.error("Could not load older conversations", error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  return (
    <div className="overflow-y-auto [scrollbar-gutter:stable] w-full h-full pt-[10px] px-[10px]">
      {itemIds.length ? (
        <div className="flex flex-col gap-[4px]">
          {itemIds.map((key) => (
            <ChatListItem key={key} itemId={key} />
          ))}
          {hasMoreConversationHistory && (
            <button
              type="button"
              className="flex min-h-[40px] items-center justify-center gap-[8px] text-[13px] text-primary disabled:cursor-wait disabled:opacity-60"
              disabled={isLoadingHistory}
              onClick={loadOlderConversations}
            >
              {isLoadingHistory && <Spinner size={16} />}
              Ver conversas anteriores
            </button>
          )}
        </div>
      ) : (
        <div className="h-full flex items-center justify-center flex-col text-foreground text-[15px] mt-[-24px]">
          {t("Nada por aquí")}
          {(searchPattern || filterName !== Filters.ALL) && (
            <button
              className="text-[13px] text-primary"
              onClick={() => {
                setSearchPattern("");
                setFilterName(Filters.ALL);
              }}
            >
              {t("remover filtros...")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ChatList;
