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
      ai_runs: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          input_hash: string
          model: string
          output: string | null
          purpose: string
          report_id: string | null
          review_id: string | null
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_message?: string | null
          id?: string
          input_hash: string
          model: string
          output?: string | null
          purpose: string
          report_id?: string | null
          review_id?: string | null
          status: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          input_hash?: string
          model?: string
          output?: string | null
          purpose?: string
          report_id?: string | null
          review_id?: string | null
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_rules: {
        Row: {
          created_at: string
          id: string
          negative_rating_threshold: number
          rating_drop_threshold: number
          unanswered_hours: number
          updated_at: string
          volume_spike_percent: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          negative_rating_threshold?: number
          rating_drop_threshold?: number
          unanswered_hours?: number
          updated_at?: string
          volume_spike_percent?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          negative_rating_threshold?: number
          rating_drop_threshold?: number
          unanswered_hours?: number
          updated_at?: string
          volume_spike_percent?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          id: string
          metadata: Json
          target_id: string | null
          target_type: string | null
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competitors_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connected_platforms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_business_connections: {
        Row: {
          access_token_ciphertext: string
          created_at: string
          google_account_email: string | null
          id: string
          last_error: string | null
          last_synced_at: string | null
          refresh_token_ciphertext: string
          scopes: string[]
          status: string
          token_expires_at: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_ciphertext: string
          created_at?: string
          google_account_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_ciphertext: string
          scopes?: string[]
          status?: string
          token_expires_at: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_ciphertext?: string
          created_at?: string
          google_account_email?: string | null
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_ciphertext?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_business_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          code_verifier_ciphertext: string
          created_at: string
          expires_at: string
          id: string
          redirect_origin: string
          state_hash: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          code_verifier_ciphertext: string
          created_at?: string
          expires_at: string
          id?: string
          redirect_origin: string
          state_hash: string
          used_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          code_verifier_ciphertext?: string
          created_at?: string
          expires_at?: string
          id?: string
          redirect_origin?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          endpoint: string
          error_message: string | null
          http_status: number | null
          id: string
          method: string
          operation: string
          outcome_code: string | null
          provider: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          endpoint: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          method?: string
          operation: string
          outcome_code?: string | null
          provider: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          endpoint?: string
          error_message?: string | null
          http_status?: number | null
          id?: string
          method?: string
          operation?: string
          outcome_code?: string | null
          provider?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_api_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_connections: {
        Row: {
          access_token_ciphertext: string | null
          account_label: string | null
          account_ref: string | null
          api_key_ciphertext: string | null
          connected_at: string | null
          connected_by: string | null
          created_at: string
          id: string
          kind: string
          last_error: string | null
          last_test_ok: boolean | null
          last_tested_at: string | null
          metadata: Json
          provider: string
          refresh_token_ciphertext: string | null
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          access_token_ciphertext?: string | null
          account_label?: string | null
          account_ref?: string | null
          api_key_ciphertext?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          metadata?: Json
          provider: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          access_token_ciphertext?: string | null
          account_label?: string | null
          account_ref?: string | null
          api_key_ciphertext?: string | null
          connected_at?: string | null
          connected_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          last_test_ok?: boolean | null
          last_tested_at?: string | null
          metadata?: Json
          provider?: string
          refresh_token_ciphertext?: string | null
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_connections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          created_at: string
          event_type: string
          http_status: number | null
          id: string
          level: string
          message: string
          provider: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          http_status?: number | null
          id?: string
          level?: string
          message: string
          provider: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          http_status?: number | null
          id?: string
          level?: string
          message?: string
          provider?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_health: {
        Row: {
          last_checked_at: string
          last_error: string | null
          last_ok_at: string | null
          latency_ms: number | null
          outcome_code: string | null
          provider: string
          status: string
          workspace_id: string
        }
        Insert: {
          last_checked_at?: string
          last_error?: string | null
          last_ok_at?: string | null
          latency_ms?: number | null
          outcome_code?: string | null
          provider: string
          status: string
          workspace_id: string
        }
        Update: {
          last_checked_at?: string
          last_error?: string | null
          last_ok_at?: string | null
          latency_ms?: number | null
          outcome_code?: string | null
          provider?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_oauth_states: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          payload_ciphertext: string
          provider: string
          redirect_origin: string
          state_hash: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          payload_ciphertext: string
          provider: string
          redirect_origin: string
          state_hash: string
          used_at?: string | null
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          payload_ciphertext?: string
          provider?: string
          redirect_origin?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_oauth_states_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_provider_credentials: {
        Row: {
          created_at: string
          field_key: string
          id: string
          masked_hint: string
          provider: string
          updated_at: string
          updated_by: string | null
          value_ciphertext: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          field_key: string
          id?: string
          masked_hint?: string
          provider: string
          updated_at?: string
          updated_by?: string | null
          value_ciphertext: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          field_key?: string
          id?: string
          masked_hint?: string
          provider?: string
          updated_at?: string
          updated_by?: string | null
          value_ciphertext?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_provider_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_rate_limits: {
        Row: {
          id: string
          limit_value: number | null
          provider: string
          recorded_at: string
          remaining: number | null
          reset_at: string | null
          source: string
          workspace_id: string
        }
        Insert: {
          id?: string
          limit_value?: number | null
          provider: string
          recorded_at?: string
          remaining?: number | null
          reset_at?: string | null
          source?: string
          workspace_id: string
        }
        Update: {
          id?: string
          limit_value?: number | null
          provider?: string
          recorded_at?: string
          remaining?: number | null
          reset_at?: string | null
          source?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_rate_limits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_sync_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          job_type: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          priority: number
          provider: string
          started_at: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          priority?: number
          provider: string
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          job_type?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          priority?: number
          provider?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_usage: {
        Row: {
          created_at: string
          id: string
          metric: string
          period_end: string
          period_start: string
          provider: string
          source: string
          value: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          period_end: string
          period_start: string
          provider: string
          source?: string
          value: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          period_end?: string
          period_start?: string
          provider?: string
          source?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhook_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          headers: Json
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string | null
          signature_valid: boolean | null
          status: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          headers?: Json
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          provider_event_id?: string | null
          signature_valid?: boolean | null
          status?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          headers?: Json
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string | null
          signature_valid?: boolean | null
          status?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhook_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
        }
        Insert: {
          city: string
          country: string
          created_at?: string
          external_ref?: string | null
          id?: string
          manager?: string | null
          name: string
          workspace_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          manager?: string | null
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      provider_raw_data: {
        Row: {
          external_id: string | null
          fetched_at: string
          id: string
          payload: Json
          provider: string
          resource_type: string
          scan_id: string | null
          workspace_id: string
        }
        Insert: {
          external_id?: string | null
          fetched_at?: string
          id?: string
          payload: Json
          provider: string
          resource_type: string
          scan_id?: string | null
          workspace_id: string
        }
        Update: {
          external_id?: string | null
          fetched_at?: string
          id?: string
          payload?: Json
          provider?: string
          resource_type?: string
          scan_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_raw_data_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_raw_data_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_resources: {
        Row: {
          connection_id: string | null
          created_at: string
          external_id: string
          id: string
          last_synced_at: string | null
          metadata: Json
          name: string | null
          parent_external_id: string | null
          provider: string
          resource_type: string
          updated_at: string
          url: string | null
          workspace_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          external_id: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          parent_external_id?: string | null
          provider: string
          resource_type: string
          updated_at?: string
          url?: string | null
          workspace_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          external_id?: string
          id?: string
          last_synced_at?: string | null
          metadata?: Json
          name?: string | null
          parent_external_id?: string | null
          provider?: string
          resource_type?: string
          updated_at?: string
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_resources_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "integration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_resources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      removal_cases: {
        Row: {
          appeal_text: string | null
          confidence: number
          created_at: string
          id: string
          model: string | null
          rationale: string
          resolved_at: string | null
          review_id: string
          status: string
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string
          violation_type: string
          workspace_id: string
        }
        Insert: {
          appeal_text?: string | null
          confidence?: number
          created_at?: string
          id?: string
          model?: string | null
          rationale: string
          resolved_at?: string | null
          review_id: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          violation_type: string
          workspace_id: string
        }
        Update: {
          appeal_text?: string | null
          confidence?: number
          created_at?: string
          id?: string
          model?: string | null
          rationale?: string
          resolved_at?: string | null
          review_id?: string
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string
          violation_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "removal_cases_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "removal_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      removal_scan_settings: {
        Row: {
          batch_size: number
          created_at: string
          enabled: boolean
          id: string
          interval_minutes: number
          last_run_at: string | null
          lease_expires_at: string | null
          next_run_at: string
          paused_reason: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          batch_size?: number
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_run_at?: string | null
          lease_expires_at?: string | null
          next_run_at?: string
          paused_reason?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          batch_size?: number
          created_at?: string
          enabled?: boolean
          id?: string
          interval_minutes?: number
          last_run_at?: string | null
          lease_expires_at?: string | null
          next_run_at?: string
          paused_reason?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "removal_scan_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      removal_scans: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          model: string | null
          reviews_checked: number
          reviews_flagged: number
          started_by: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          reviews_checked?: number
          reviews_flagged?: number
          started_by?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          model?: string | null
          reviews_checked?: number
          reviews_flagged?: number
          started_by?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "removal_scans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          source: string
          status?: string
          tags?: string[]
          title?: string | null
          unread?: boolean
          updated_at?: string
          workspace_id: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_findings: {
        Row: {
          category: string
          code: string
          created_at: string
          detail: string
          evidence: Json
          id: string
          impact: number
          recommendation: string | null
          scan_id: string
          severity: string
          source: string
          title: string
          workspace_id: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          detail: string
          evidence?: Json
          id?: string
          impact?: number
          recommendation?: string | null
          scan_id: string
          severity: string
          source: string
          title: string
          workspace_id: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          detail?: string
          evidence?: Json
          id?: string
          impact?: number
          recommendation?: string | null
          scan_id?: string
          severity?: string
          source?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_findings_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_findings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_metrics: {
        Row: {
          category: string
          created_at: string
          id: string
          metric_key: string
          scan_id: string
          source: string
          unit: string | null
          value_numeric: number | null
          value_text: string | null
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          metric_key: string
          scan_id: string
          source: string
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          metric_key?: string
          scan_id?: string
          source?: string
          unit?: string | null
          value_numeric?: number | null
          value_text?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_metrics_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_metrics_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_reports: {
        Row: {
          category_scores: Json
          created_at: string
          generated_by: string | null
          id: string
          model: string | null
          scan_id: string
          score: number | null
          summary: string | null
          workspace_id: string
        }
        Insert: {
          category_scores?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          model?: string | null
          scan_id: string
          score?: number | null
          summary?: string | null
          workspace_id: string
        }
        Update: {
          category_scores?: Json
          created_at?: string
          generated_by?: string | null
          id?: string
          model?: string | null
          scan_id?: string
          score?: number | null
          summary?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_reports_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: true
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_sources: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          http_status: number | null
          id: string
          provider: string | null
          raw: Json
          scan_id: string
          source: string
          status: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          provider?: string | null
          raw?: Json
          scan_id: string
          source: string
          status: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          provider?: string | null
          raw?: Json
          scan_id?: string
          source?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scan_sources_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scans: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: string
          max_attempts: number
          requested_by: string | null
          scan_type: string
          score: number | null
          started_at: string | null
          status: string
          target_domain: string
          target_url: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          max_attempts?: number
          requested_by?: string | null
          scan_type?: string
          score?: number | null
          started_at?: string | null
          status?: string
          target_domain: string
          target_url: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          max_attempts?: number
          requested_by?: string | null
          scan_type?: string
          score?: number | null
          started_at?: string | null
          status?: string
          target_domain?: string
          target_url?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scans_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduler_tokens: {
        Row: {
          created_at: string
          name: string
          token: string
        }
        Insert: {
          created_at?: string
          name: string
          token: string
        }
        Update: {
          created_at?: string
          name?: string
          token?: string
        }
        Relationships: []
      }
      seo_backlinks: {
        Row: {
          anchor: string | null
          authority: number | null
          created_at: string
          domain: string
          first_seen: string | null
          id: string
          is_nofollow: boolean | null
          last_seen: string | null
          provider: string
          source_url: string
          target_url: string | null
          workspace_id: string
        }
        Insert: {
          anchor?: string | null
          authority?: number | null
          created_at?: string
          domain: string
          first_seen?: string | null
          id?: string
          is_nofollow?: boolean | null
          last_seen?: string | null
          provider: string
          source_url: string
          target_url?: string | null
          workspace_id: string
        }
        Update: {
          anchor?: string | null
          authority?: number | null
          created_at?: string
          domain?: string
          first_seen?: string | null
          id?: string
          is_nofollow?: boolean | null
          last_seen?: string | null
          provider?: string
          source_url?: string
          target_url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_backlinks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_keywords: {
        Row: {
          created_at: string
          domain: string
          id: string
          keyword: string
          language: string | null
          location: string | null
          search_engine: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          keyword: string
          language?: string | null
          location?: string | null
          search_engine?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          keyword?: string
          language?: string | null
          location?: string | null
          search_engine?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_keywords_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_rankings: {
        Row: {
          checked_at: string
          id: string
          keyword_id: string
          position: number | null
          provider: string
          serp_features: Json
          url: string | null
          workspace_id: string
        }
        Insert: {
          checked_at?: string
          id?: string
          keyword_id: string
          position?: number | null
          provider: string
          serp_features?: Json
          url?: string | null
          workspace_id: string
        }
        Update: {
          checked_at?: string
          id?: string
          keyword_id?: string
          position?: number | null
          provider?: string
          serp_features?: Json
          url?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_rankings_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "seo_keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seo_rankings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          alerts_created: number
          completed_at: string | null
          error_message: string | null
          id: string
          locations_found: number
          platform: string
          reviews_created: number
          reviews_found: number
          reviews_updated: number
          started_at: string
          status: string
          workspace_id: string
        }
        Insert: {
          alerts_created?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          locations_found?: number
          platform: string
          reviews_created?: number
          reviews_found?: number
          reviews_updated?: number
          started_at?: string
          status?: string
          workspace_id: string
        }
        Update: {
          alerts_created?: number
          completed_at?: string | null
          error_message?: string | null
          id?: string
          locations_found?: number
          platform?: string
          reviews_created?: number
          reviews_found?: number
          reviews_updated?: number
          started_at?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_google_oauth_state: {
        Args: { _state_hash: string }
        Returns: {
          code_verifier_ciphertext: string
          created_at: string
          expires_at: string
          id: string
          redirect_origin: string
          state_hash: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "google_oauth_states"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_integration_oauth_state: {
        Args: { _state_hash: string }
        Returns: {
          created_at: string
          expires_at: string
          id: string
          payload_ciphertext: string
          provider: string
          redirect_origin: string
          state_hash: string
          used_at: string | null
          user_id: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "integration_oauth_states"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      workspace_role: "owner" | "admin" | "member"
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
    Enums: {
      workspace_role: ["owner", "admin", "member"],
    },
  },
} as const
