export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string
          detail: string
          id: string
          kind: string
          location_name: string
          resolved: boolean
          review_id: string | null
          severity: string
          title: string
        }
        Insert: {
          created_at?: string
          detail: string
          id?: string
          kind: string
          location_name?: string
          resolved?: boolean
          review_id?: string | null
          severity?: string
          title: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          kind?: string
          location_name?: string
          resolved?: boolean
          review_id?: string | null
          severity?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_settings: {
        Row: {
          alert_email: string | null
          brand_name: string
          created_at: string
          id: string
          industry: string
          negative_review_alerts: boolean
          reply_signature: string
          reply_tone: string
          updated_at: string
          website: string | null
          weekly_digest: boolean
        }
        Insert: {
          alert_email?: string | null
          brand_name?: string
          created_at?: string
          id?: string
          industry?: string
          negative_review_alerts?: boolean
          reply_signature?: string
          reply_tone?: string
          updated_at?: string
          website?: string | null
          weekly_digest?: boolean
        }
        Update: {
          alert_email?: string | null
          brand_name?: string
          created_at?: string
          id?: string
          industry?: string
          negative_review_alerts?: boolean
          reply_signature?: string
          reply_tone?: string
          updated_at?: string
          website?: string | null
          weekly_digest?: boolean
        }
        Relationships: []
      }
      competitors: {
        Row: {
          created_at: string
          id: string
          is_you: boolean
          name: string
          notes: string | null
          rating: number
          response_rate: number
          review_count: number
          sentiment_score: number
          trend: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_you?: boolean
          name: string
          notes?: string | null
          rating?: number
          response_rate?: number
          review_count?: number
          sentiment_score?: number
          trend?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_you?: boolean
          name?: string
          notes?: string | null
          rating?: number
          response_rate?: number
          review_count?: number
          sentiment_score?: number
          trend?: number
          updated_at?: string
        }
        Relationships: []
      }
      connected_platforms: {
        Row: {
          account_ref: string | null
          created_at: string
          display_name: string
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          platform: string
          status: string
          supports_oauth: boolean
          updated_at: string
        }
        Insert: {
          account_ref?: string | null
          created_at?: string
          display_name: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform: string
          status?: string
          supports_oauth?: boolean
          updated_at?: string
        }
        Update: {
          account_ref?: string | null
          created_at?: string
          display_name?: string
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          platform?: string
          status?: string
          supports_oauth?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          city: string
          country: string
          created_at: string
          external_ref: string | null
          id: string
          manager: string | null
          name: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          external_ref?: string | null
          id?: string
          manager?: string | null
          name: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          manager?: string | null
          name?: string
        }
        Relationships: []
      }
      platform_credentials: {
        Row: {
          access_token: string
          account_name: string | null
          created_at: string
          platform: string
          refresh_token: string | null
          scope: string | null
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          created_at?: string
          platform: string
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          created_at?: string
          platform?: string
          refresh_token?: string | null
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          job_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          job_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          job_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          generated_by: string | null
          id: string
          period: string
          scope: string
          status: string
          summary: string | null
          title: string
        }
        Insert: {
          created_at?: string
          generated_by?: string | null
          id?: string
          period: string
          scope?: string
          status?: string
          summary?: string | null
          title: string
        }
        Update: {
          created_at?: string
          generated_by?: string | null
          id?: string
          period?: string
          scope?: string
          status?: string
          summary?: string | null
          title?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author: string
          body: string
          created_at: string
          external_created_at: string
          external_id: string | null
          id: string
          location_name: string
          platform: string
          priority: string
          rating: number
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          sentiment: string
          source: string
          status: string
          tags: string[]
          title: string | null
          unread: boolean
          updated_at: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          external_created_at?: string
          external_id?: string | null
          id?: string
          location_name?: string
          platform: string
          priority?: string
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          sentiment?: string
          source?: string
          status?: string
          tags?: string[]
          title?: string | null
          unread?: boolean
          updated_at?: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          external_created_at?: string
          external_id?: string | null
          id?: string
          location_name?: string
          platform?: string
          priority?: string
          rating?: number
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          sentiment?: string
          source?: string
          status?: string
          tags?: string[]
          title?: string | null
          unread?: boolean
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
