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
      client_collaborators: {
        Row: {
          client_id: string
          collaborator_profile_id: string
          created_at: string
          id: string
        }
        Insert: {
          client_id: string
          collaborator_profile_id: string
          created_at?: string
          id?: string
        }
        Update: {
          client_id?: string
          collaborator_profile_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_collaborators_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_collaborators_collaborator_profile_id_fkey"
            columns: ["collaborator_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          data_entrada: string | null
          data_ultima_sincronizacao: string | null
          documento: string | null
          email: string | null
          id: string
          nome_fantasia: string | null
          observacoes: string | null
          omie_id: string | null
          origem_cadastro: string
          owner_profile_id: string | null
          razao_social: string
          status: string
          telefone: string | null
          tipo: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_entrada?: string | null
          data_ultima_sincronizacao?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          omie_id?: string | null
          origem_cadastro?: string
          owner_profile_id?: string | null
          razao_social: string
          status?: string
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_entrada?: string | null
          data_ultima_sincronizacao?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          nome_fantasia?: string | null
          observacoes?: string | null
          omie_id?: string | null
          origem_cadastro?: string
          owner_profile_id?: string | null
          razao_social?: string
          status?: string
          telefone?: string | null
          tipo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          cargo: string | null
          created_at: string
          data_admissao: string | null
          departamento: string | null
          id: string
          profile_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          id?: string
          profile_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          id?: string
          profile_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requirements: {
        Row: {
          client_id: string
          created_at: string
          id: string
          observacoes: string | null
          periodicidade: string
          tipo_documento: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          observacoes?: string | null
          periodicidade?: string
          tipo_documento: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          observacoes?: string | null
          periodicidade?: string
          tipo_documento?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requirements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          client_id: string
          competencia: string | null
          created_at: string
          id: string
          nome: string
          observacoes: string | null
          status: string
          storage_path: string
          tipo: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          client_id: string
          competencia?: string | null
          created_at?: string
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          storage_path: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          client_id?: string
          competencia?: string | null
          created_at?: string
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          storage_path?: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions: {
        Row: {
          actor_profile_id: string | null
          anexos: Json | null
          client_id: string
          created_at: string
          descricao: string
          id: string
          tipo: string
          updated_at: string
        }
        Insert: {
          actor_profile_id?: string | null
          anexos?: Json | null
          client_id: string
          created_at?: string
          descricao: string
          id?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          actor_profile_id?: string | null
          anexos?: Json | null
          client_id?: string
          created_at?: string
          descricao?: string
          id?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interactions_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          lida: boolean
          link: string | null
          mensagem: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: []
      }
      pending_tasks: {
        Row: {
          client_id: string
          collaborator_id: string | null
          competencia: string | null
          created_at: string
          created_by: string | null
          data_conclusao: string | null
          descricao: string | null
          id: string
          prazo: string | null
          prioridade: string
          status: string
          tipo: string | null
          titulo: string
          updated_at: string
        }
        Insert: {
          client_id: string
          collaborator_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          status?: string
          tipo?: string | null
          titulo: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          collaborator_id?: string | null
          competencia?: string | null
          created_at?: string
          created_by?: string | null
          data_conclusao?: string | null
          descricao?: string | null
          id?: string
          prazo?: string | null
          prioridade?: string
          status?: string
          tipo?: string | null
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      timeline_events: {
        Row: {
          actor_profile_id: string | null
          client_id: string
          created_at: string
          descricao: string
          id: string
          metadata: Json | null
          tipo: string
        }
        Insert: {
          actor_profile_id?: string | null
          client_id: string
          created_at?: string
          descricao: string
          id?: string
          metadata?: Json | null
          tipo: string
        }
        Update: {
          actor_profile_id?: string | null
          client_id?: string
          created_at?: string
          descricao?: string
          id?: string
          metadata?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      user_has_client_access: {
        Args: { _client_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "collaborator" | "client"
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
    Enums: {
      app_role: ["admin", "collaborator", "client"],
    },
  },
} as const
