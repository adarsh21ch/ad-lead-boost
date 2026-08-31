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
      accounts: {
        Row: {
          created_at: string
          id: string
          meta_access_token_encrypted: string | null
          meta_ad_account_id: string | null
          meta_ad_account_name: string | null
          meta_ad_account_timezone: string | null
          meta_dataset_id: string | null
          meta_dataset_name: string | null
          meta_page_id: string | null
          meta_token_expires_at: string | null
          name: string
          owner_user_id: string
          page_subscribe_error: string | null
          page_subscribe_status: string | null
          page_subscribed_at: string | null
          status: string
          token_invalid_since: string | null
          token_last_error: string | null
          token_last_error_at: string | null
          token_last_ok_at: string | null
          token_status: string
          webhook_api_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta_access_token_encrypted?: string | null
          meta_ad_account_id?: string | null
          meta_ad_account_name?: string | null
          meta_ad_account_timezone?: string | null
          meta_dataset_id?: string | null
          meta_dataset_name?: string | null
          meta_page_id?: string | null
          meta_token_expires_at?: string | null
          name: string
          owner_user_id: string
          page_subscribe_error?: string | null
          page_subscribe_status?: string | null
          page_subscribed_at?: string | null
          status?: string
          token_invalid_since?: string | null
          token_last_error?: string | null
          token_last_error_at?: string | null
          token_last_ok_at?: string | null
          token_status?: string
          webhook_api_key?: string
        }
        Update: {
          created_at?: string
          id?: string
          meta_access_token_encrypted?: string | null
          meta_ad_account_id?: string | null
          meta_ad_account_name?: string | null
          meta_ad_account_timezone?: string | null
          meta_dataset_id?: string | null
          meta_dataset_name?: string | null
          meta_page_id?: string | null
          meta_token_expires_at?: string | null
          name?: string
          owner_user_id?: string
          page_subscribe_error?: string | null
          page_subscribe_status?: string | null
          page_subscribed_at?: string | null
          status?: string
          token_invalid_since?: string | null
          token_last_error?: string | null
          token_last_error_at?: string | null
          token_last_ok_at?: string | null
          token_status?: string
          webhook_api_key?: string
        }
        Relationships: []
      }
      ad_entities: {
        Row: {
          account_id: string
          creative_id: string | null
          creative_thumbnail_url: string | null
          daily_budget: number | null
          effective_status: string | null
          entity_id: string
          first_seen_at: string
          last_synced_at: string
          level: string
          lifetime_budget: number | null
          meta_ad_account_id: string | null
          name: string | null
          objective: string | null
          optimization_goal: string | null
          parent_id: string | null
          status: string | null
        }
        Insert: {
          account_id: string
          creative_id?: string | null
          creative_thumbnail_url?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          entity_id: string
          first_seen_at?: string
          last_synced_at?: string
          level: string
          lifetime_budget?: number | null
          meta_ad_account_id?: string | null
          name?: string | null
          objective?: string | null
          optimization_goal?: string | null
          parent_id?: string | null
          status?: string | null
        }
        Update: {
          account_id?: string
          creative_id?: string | null
          creative_thumbnail_url?: string | null
          daily_budget?: number | null
          effective_status?: string | null
          entity_id?: string
          first_seen_at?: string
          last_synced_at?: string
          level?: string
          lifetime_budget?: number | null
          meta_ad_account_id?: string | null
          name?: string | null
          objective?: string | null
          optimization_goal?: string | null
          parent_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_entities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_insights_daily: {
        Row: {
          account_id: string
          actions: Json | null
          attribution_window: string
          clicks: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          currency: string | null
          entity_id: string
          frequency: number | null
          impressions: number | null
          last_seen_at: string
          level: string
          meta_ad_account_id: string | null
          meta_leads: number | null
          reach: number | null
          snapshot_at: string
          spend: number | null
          stat_date: string
          sync_run_id: string | null
        }
        Insert: {
          account_id: string
          actions?: Json | null
          attribution_window: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency?: string | null
          entity_id: string
          frequency?: number | null
          impressions?: number | null
          last_seen_at?: string
          level: string
          meta_ad_account_id?: string | null
          meta_leads?: number | null
          reach?: number | null
          snapshot_at?: string
          spend?: number | null
          stat_date: string
          sync_run_id?: string | null
        }
        Update: {
          account_id?: string
          actions?: Json | null
          attribution_window?: string
          clicks?: number | null
          cpc?: number | null
          cpm?: number | null
          ctr?: number | null
          currency?: string | null
          entity_id?: string
          frequency?: number | null
          impressions?: number | null
          last_seen_at?: string
          level?: string
          meta_ad_account_id?: string | null
          meta_leads?: number | null
          reach?: number | null
          snapshot_at?: string
          spend?: number | null
          stat_date?: string
          sync_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_admins: {
        Row: {
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      capi_delivery_logs: {
        Row: {
          delivered_at: string | null
          http_status: number | null
          id: string
          is_test: boolean
          meta_event_name: string
          meta_response: Json | null
          retry_count: number
          status_event_id: string
        }
        Insert: {
          delivered_at?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          meta_event_name: string
          meta_response?: Json | null
          retry_count?: number
          status_event_id: string
        }
        Update: {
          delivered_at?: string | null
          http_status?: number | null
          id?: string
          is_test?: boolean
          meta_event_name?: string
          meta_response?: Json | null
          retry_count?: number
          status_event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "capi_delivery_logs_status_event_id_fkey"
            columns: ["status_event_id"]
            isOneToOne: false
            referencedRelation: "lead_status_history"
            referencedColumns: ["status_event_id"]
          },
          {
            foreignKeyName: "capi_delivery_logs_status_event_id_fkey"
            columns: ["status_event_id"]
            isOneToOne: false
            referencedRelation: "status_events"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_sync_runs: {
        Row: {
          account_id: string | null
          date_from: string | null
          date_to: string | null
          days_requested: number | null
          entities_upserted: number
          error: string | null
          finished_at: string | null
          id: string
          levels: string[] | null
          meta_calls: number
          meta_code: number | null
          meta_subcode: number | null
          rows_unchanged: number
          rows_written: number
          started_at: string
          status: string
        }
        Insert: {
          account_id?: string | null
          date_from?: string | null
          date_to?: string | null
          days_requested?: number | null
          entities_upserted?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          levels?: string[] | null
          meta_calls?: number
          meta_code?: number | null
          meta_subcode?: number | null
          rows_unchanged?: number
          rows_written?: number
          started_at?: string
          status?: string
        }
        Update: {
          account_id?: string | null
          date_from?: string | null
          date_to?: string | null
          days_requested?: number | null
          entities_upserted?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          levels?: string[] | null
          meta_calls?: number
          meta_code?: number | null
          meta_subcode?: number | null
          rows_unchanged?: number
          rows_written?: number
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          account_id: string
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_name: string | null
          campaign_id: string | null
          campaign_name: string | null
          client_ip: unknown
          client_user_agent: string | null
          created_at: string
          email: string | null
          email_hash: string | null
          enriched_at: string | null
          enrichment_attempts: number
          enrichment_error: string | null
          enrichment_status: string
          event_id: string
          fbc: string | null
          fbp: string | null
          form_id: string | null
          full_name: string | null
          id: string
          is_test: boolean
          meta_leadgen_id: string | null
          notes: string | null
          phone: string | null
          phone_hash: string | null
          raw_field_data: Json | null
          responses: Json
        }
        Insert: {
          account_id: string
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_ip?: unknown
          client_user_agent?: string | null
          created_at?: string
          email?: string | null
          email_hash?: string | null
          enriched_at?: string | null
          enrichment_attempts?: number
          enrichment_error?: string | null
          enrichment_status?: string
          event_id?: string
          fbc?: string | null
          fbp?: string | null
          form_id?: string | null
          full_name?: string | null
          id?: string
          is_test?: boolean
          meta_leadgen_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_hash?: string | null
          raw_field_data?: Json | null
          responses?: Json
        }
        Update: {
          account_id?: string
          ad_id?: string | null
          ad_name?: string | null
          adset_id?: string | null
          adset_name?: string | null
          campaign_id?: string | null
          campaign_name?: string | null
          client_ip?: unknown
          client_user_agent?: string | null
          created_at?: string
          email?: string | null
          email_hash?: string | null
          enriched_at?: string | null
          enrichment_attempts?: number
          enrichment_error?: string | null
          enrichment_status?: string
          event_id?: string
          fbc?: string | null
          fbp?: string | null
          form_id?: string | null
          full_name?: string | null
          id?: string
          is_test?: boolean
          meta_leadgen_id?: string | null
          notes?: string | null
          phone?: string | null
          phone_hash?: string | null
          raw_field_data?: Json | null
          responses?: Json
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_pages: {
        Row: {
          account_id: string
          discovered_at: string
          id: string
          page_id: string
          page_name: string | null
          subscribe_error: string | null
          subscribe_status: string
          subscribed_at: string | null
        }
        Insert: {
          account_id: string
          discovered_at?: string
          id?: string
          page_id: string
          page_name?: string | null
          subscribe_error?: string | null
          subscribe_status?: string
          subscribed_at?: string | null
        }
        Update: {
          account_id?: string
          discovered_at?: string
          id?: string
          page_id?: string
          page_name?: string | null
          subscribe_error?: string | null
          subscribe_status?: string
          subscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meta_pages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_rules: {
        Row: {
          account_id: string
          rule: Json
          updated_at: string
        }
        Insert: {
          account_id: string
          rule?: Json
          updated_at?: string
        }
        Update: {
          account_id?: string
          rule?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualification_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      retention_runs: {
        Row: {
          cutoff: string
          id: string
          leads_deleted: number
          note: string | null
          ran_at: string
        }
        Insert: {
          cutoff: string
          id?: string
          leads_deleted: number
          note?: string | null
          ran_at?: string
        }
        Update: {
          cutoff?: string
          id?: string
          leads_deleted?: number
          note?: string | null
          ran_at?: string
        }
        Relationships: []
      }
      status_events: {
        Row: {
          account_id: string
          created_at: string
          dispatch_status: string
          id: string
          lead_id: string
          next_attempt_at: string
          raw_payload: Json | null
          source: string
          status: string
          suggested_status: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          dispatch_status?: string
          id?: string
          lead_id: string
          next_attempt_at?: string
          raw_payload?: Json | null
          source: string
          status: string
          suggested_status?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          dispatch_status?: string
          id?: string
          lead_id?: string
          next_attempt_at?: string
          raw_payload?: Json | null
          source?: string
          status?: string
          suggested_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_qualification_suggestions"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      token_health_events: {
        Row: {
          account_id: string
          created_at: string
          event: string
          id: string
          meta_code: number | null
          meta_message: string | null
          meta_subcode: number | null
          source: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          event: string
          id?: string
          meta_code?: number | null
          meta_message?: string | null
          meta_subcode?: number | null
          source?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          event?: string
          id?: string
          meta_code?: number | null
          meta_message?: string | null
          meta_subcode?: number | null
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "token_health_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      ad_insights_current: {
        Row: {
          account_id: string | null
          actions: Json | null
          attribution_window: string | null
          clicks: number | null
          cpc: number | null
          cpm: number | null
          ctr: number | null
          currency: string | null
          entity_id: string | null
          frequency: number | null
          impressions: number | null
          last_seen_at: string | null
          level: string | null
          meta_ad_account_id: string | null
          meta_leads: number | null
          reach: number | null
          snapshot_at: string | null
          spend: number | null
          stat_date: string | null
          sync_run_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_performance_daily: {
        Row: {
          account_id: string | null
          adspro_leads: number | null
          attribution_window: string | null
          booked: number | null
          clicks: number | null
          close_rate: number | null
          contacted: number | null
          cost_per_booked: number | null
          cost_per_lead: number | null
          cost_per_purchase: number | null
          cost_per_qualified_lead: number | null
          cpc: number | null
          cpm: number | null
          creative_thumbnail_url: string | null
          ctr: number | null
          currency: string | null
          disqualified: number | null
          effective_status: string | null
          entity_id: string | null
          entity_name: string | null
          frequency: number | null
          impressions: number | null
          last_seen_at: string | null
          lead_delivery_gap: number | null
          level: string | null
          low_sample: boolean | null
          meta_ad_account_id: string | null
          meta_ad_account_name: string | null
          meta_leads: number | null
          no_show: number | null
          parent_id: string | null
          purchased: number | null
          qualification_rate: number | null
          qualified: number | null
          reach: number | null
          snapshot_at: string | null
          spend: number | null
          stat_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_insights_daily_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      insights_sync_status: {
        Row: {
          account_id: string | null
          age: string | null
          entities_upserted: number | null
          error: string | null
          finished_at: string | null
          meta_code: number | null
          meta_subcode: number | null
          rows_written: number | null
          started_at: string | null
          status: string | null
          verdict: string | null
        }
        Relationships: [
          {
            foreignKeyName: "insights_sync_runs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_attribution: {
        Row: {
          account_id: string | null
          ad_id: string | null
          ad_name: string | null
          adset_id: string | null
          adset_id_derived: boolean | null
          adset_name: string | null
          campaign_id: string | null
          campaign_id_derived: boolean | null
          campaign_name: string | null
          created_at: string | null
          enrichment_status: string | null
          full_name: string | null
          id: string | null
          is_test: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification_suggestions: {
        Row: {
          account_id: string | null
          awaiting_decision: boolean | null
          confidence: string | null
          created_at: string | null
          is_untouched: boolean | null
          lead_id: string | null
          matched_key: string | null
          matched_value: string | null
          reason: string | null
          suggested_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_source_options: {
        Row: {
          account_id: string | null
          entity_id: string | null
          lead_count: number | null
          level: string | null
          name: string | null
          parent_id: string | null
        }
        Relationships: []
      }
      lead_status_history: {
        Row: {
          account_id: string | null
          created_at: string | null
          delivered_at: string | null
          dispatch_status: string | null
          http_status: number | null
          lead_id: string | null
          meta_event_name: string | null
          retry_count: number | null
          source: string | null
          status: string | null
          status_event_id: string | null
          suggested_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_attribution"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "lead_qualification_suggestions"
            referencedColumns: ["lead_id"]
          },
          {
            foreignKeyName: "status_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      qualification_agreement: {
        Row: {
          accept_rate_pct: number | null
          accepted: number | null
          account_id: string | null
          decisions: number | null
          suggested_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "status_events_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_ops_accounts: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          created_at: string
          days_to_expiry: number
          meta_ad_account_id: string
          meta_ad_account_name: string
          meta_dataset_id: string
          meta_dataset_name: string
          owner_email: string
          owner_user_id: string
          page_subscribe_error: string
          page_subscribe_status: string
          status: string
          token_expires_at: string
          token_last_error: string
          token_last_error_at: string
          token_last_ok_at: string
          token_status: string
        }[]
      }
      admin_ops_alerts: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          area: string
          detail: string
          message: string
          severity: string
        }[]
      }
      admin_ops_capi_health: {
        Args: { p_hours?: number }
        Returns: {
          account_id: string
          account_name: string
          delivered: number
          dispatch_breakdown: Json
          events: number
          failed: number
          last_event_at: string
          oldest_pending_minutes: number
          pending: number
          retries: number
        }[]
      }
      admin_ops_cron: {
        Args: never
        Returns: {
          active: boolean
          jobname: string
          last_message: string
          last_run_at: string
          last_status: string
          schedule: string
        }[]
      }
      admin_ops_leads: {
        Args: { p_days?: number }
        Returns: {
          account_id: string
          account_name: string
          last_lead_at: string
          last_real_lead_at: string
          leads_real: number
          leads_real_window: number
          leads_test: number
          leads_total: number
          leads_window: number
          unlinked_real: number
        }[]
      }
      admin_ops_retention: {
        Args: { p_limit?: number }
        Returns: {
          cutoff: string
          leads_deleted: number
          note: string
          ran_at: string
        }[]
      }
      admin_ops_spend: {
        Args: { p_days?: number }
        Returns: {
          account_id: string
          account_name: string
          currency: string
          data_age_minutes: number
          impressions_window: number
          last_snapshot_at: string
          latest_stat_date: string
          meta_leads_window: number
          spend_window: number
        }[]
      }
      admin_ops_sync_health: {
        Args: never
        Returns: {
          account_id: string
          account_name: string
          age_minutes: number
          entities_upserted: number
          error: string
          failed_24h: number
          finished_at: string
          meta_calls: number
          meta_code: number
          meta_subcode: number
          rows_unchanged: number
          rows_written: number
          runs_24h: number
          started_at: string
          status: string
          verdict: string
        }[]
      }
      check_token_expiry: { Args: { p_days?: number }; Returns: number }
      claim_due_status_events: {
        Args: { p_limit?: number }
        Returns: {
          account_id: string
          created_at: string
          id: string
          lead_id: string
          status: string
        }[]
      }
      decrypt_token: {
        Args: { p_encrypted: string; p_key: string }
        Returns: string
      }
      default_qualification_rule: { Args: never; Returns: Json }
      encrypt_token: {
        Args: { p_key: string; p_token: string }
        Returns: string
      }
      finish_insights_sync_run: {
        Args: {
          p_code?: number
          p_entities?: number
          p_error?: string
          p_meta_calls?: number
          p_run_id: string
          p_status: string
          p_subcode?: number
          p_unchanged?: number
          p_written?: number
        }
        Returns: undefined
      }
      is_app_admin: { Args: never; Returns: boolean }
      normalize_answer: { Args: { p_value: string }; Returns: string }
      record_token_health: {
        Args: {
          p_account_id: string
          p_code?: number
          p_event: string
          p_message?: string
          p_source?: string
          p_subcode?: number
        }
        Returns: undefined
      }
      request_insights_sync: {
        Args: { p_account_id: string; p_days?: number }
        Returns: Json
      }
      run_capi_dispatcher: { Args: never; Returns: undefined }
      run_insights_sync: { Args: { p_days?: number }; Returns: undefined }
      run_retention_purge: { Args: { p_days?: number }; Returns: number }
      start_insights_sync_run: {
        Args: {
          p_account_id: string
          p_date_from: string
          p_date_to: string
          p_days: number
          p_levels: string[]
        }
        Returns: string
      }
      suggest_lead_status: {
        Args: { p_responses: Json; p_rule: Json }
        Returns: {
          confidence: string
          matched_key: string
          matched_value: string
          reason: string
          suggested_status: string
        }[]
      }
      upsert_ad_entities: {
        Args: { p_account_id: string; p_rows: Json }
        Returns: number
      }
      upsert_ad_insights: {
        Args: {
          p_account_id: string
          p_attribution_window: string
          p_currency: string
          p_level: string
          p_rows: Json
          p_sync_run_id: string
        }
        Returns: Json
      }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
