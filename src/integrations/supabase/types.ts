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
          meta_dataset_id: string | null
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
          meta_dataset_id?: string | null
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
          meta_dataset_id?: string | null
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
            referencedRelation: "status_events"
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
          phone_hash: string | null
          raw_field_data: Json | null
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
          phone_hash?: string | null
          raw_field_data?: Json | null
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
          phone_hash?: string | null
          raw_field_data?: Json | null
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
      [_ in never]: never
    }
    Functions: {
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
      encrypt_token: {
        Args: { p_key: string; p_token: string }
        Returns: string
      }
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
      run_capi_dispatcher: { Args: never; Returns: undefined }
      run_retention_purge: { Args: { p_days?: number }; Returns: number }
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
