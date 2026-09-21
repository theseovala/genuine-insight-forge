// Server-pushed updates. The database is still the only source of truth: a
// realtime event just tells the app to refetch the affected query, so nothing
// is ever rendered from a client-side guess.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Table = "scans" | "scan_stages" | "notifications";

/**
 * Subscribes to row changes on the given tables and invalidates the supplied
 * query keys whenever the server pushes one. The channel is torn down on
 * unmount so repeated renders never leak subscriptions.
 */
export function useRealtimeInvalidate(
  channelName: string,
  tables: Table[],
  queryKeys: (string | undefined)[][],
  enabled = true,
) {
  const queryClient = useQueryClient();
  const tableKey = tables.join(",");
  const keyList = JSON.stringify(queryKeys);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase.channel(channelName);
    for (const table of tables) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of JSON.parse(keyList) as string[][]) {
          void queryClient.invalidateQueries({ queryKey: key.filter(Boolean) });
        }
      });
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, tableKey, keyList, enabled, queryClient]);
}
