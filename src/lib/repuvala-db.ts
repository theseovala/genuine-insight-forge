// Live data layer for RepuVala™ — connected platforms, reviews and alerts.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Alert, PlatformId, Review, Sentiment, ReviewStatus } from "@/lib/mock-data";

export interface ConnectedPlatformRow {
  id: string;
  platform: string;
  display_name: string;
  account_ref: string | null;
  status: string;
  last_synced_at: string | null;
}

function initialsOf(name: string) {
  const clean = name.replace(/^@/, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return clean.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}

export interface ReviewRow {
  id: string;
  platform: string;
  author: string;
  rating: number;
  sentiment: string;
  status: string;
  priority: string;
  location_name: string;
  title: string | null;
  body: string;
  tags: string[];
  unread: boolean;
  reply: string | null;
  replied_at: string | null;
  external_created_at: string;
}

export type LiveReview = Review & { external_created_at: string };

function toReview(row: ReviewRow): LiveReview {
  return {
    id: row.id,
    external_created_at: row.external_created_at,
    platform: row.platform as PlatformId,
    author: row.author,
    initials: initialsOf(row.author),
    rating: row.rating,
    sentiment: row.sentiment as Sentiment,
    status: row.status as ReviewStatus,
    priority: row.priority as Review["priority"],
    location: row.location_name,
    date: relativeTime(row.external_created_at),
    ...(row.title ? { title: row.title } : {}),
    body: row.body,
    tags: row.tags ?? [],
    unread: row.unread,
    ...(row.reply ? { reply: row.reply } : {}),
  };
}

export interface AlertRow {
  id: string;
  kind: string;
  severity: string;
  title: string;
  detail: string;
  location_name: string;
  resolved: boolean;
  created_at: string;
}

const kindMap: Record<string, Alert["type"]> = {
  negative_review: "negative",
  rating_drop: "drop",
  volume_spike: "spike",
  unusual: "unusual",
  unresolved: "unresolved",
  suspicious_activity: "suspicious",
};

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    type: kindMap[row.kind] ?? "unusual",
    severity: row.severity as Alert["severity"],
    title: row.title,
    detail: row.detail,
    location: row.location_name,
    time: relativeTime(row.created_at),
    resolved: row.resolved,
  };
}

export function useLiveReviews() {
  return useQuery({
    queryKey: ["reviews"],
    queryFn: async (): Promise<LiveReview[]> => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("external_created_at", { ascending: false });
      if (error) throw error;
      return (data as ReviewRow[]).map(toReview);
    },
  });
}

export function useLiveAlerts() {
  return useQuery({
    queryKey: ["alerts"],
    queryFn: async (): Promise<Alert[]> => {
      const { data, error } = await supabase
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as AlertRow[]).map(toAlert);
    },
  });
}

export function useConnectedPlatforms() {
  return useQuery({
    queryKey: ["connected_platforms"],
    queryFn: async (): Promise<ConnectedPlatformRow[]> => {
      const { data, error } = await supabase
        .from("connected_platforms")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return data as ConnectedPlatformRow[];
    },
  });
}

export function usePublishReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reply }: { id: string; reply: string }) => {
      const { error } = await supabase
        .from("reviews")
        .update({
          reply,
          replied_at: new Date().toISOString(),
          status: "replied",
          unread: false,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reviews"] });
      void qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase.from("alerts").update({ resolved }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}

export function useTogglePlatform() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, connect }: { id: string; connect: boolean }) => {
      const { error } = await supabase
        .from("connected_platforms")
        .update({
          status: connect ? "connected" : "disconnected",
          last_synced_at: connect ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["connected_platforms"] }),
  });
}
