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
      chat_conversations: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_message_at: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachment_name: string | null
          attachment_path: string | null
          attachment_size: number | null
          body: string | null
          client_id: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
          id: string
          sender_profile_id: string | null
          sender_role: string
        }
        Insert: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          client_id: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          id?: string
          sender_profile_id?: string | null
          sender_role: string
        }
        Update: {
          attachment_name?: string | null
          attachment_path?: string | null
          attachment_size?: number | null
          body?: string | null
          client_id?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          id?: string
          sender_profile_id?: string | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_checklist_items: {
        Row: {
          categoria: string
          client_id: string
          competencia: string | null
          concluded_at: string | null
          concluded_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
          document_id: string | null
          document_request_id: string | null
          id: string
          observacao: string | null
          origem: string
          plan_item_id: string | null
          prazo: string | null
          received_at: string | null
          responsavel_profile_id: string | null
          status: string
          titulo: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          categoria?: string
          client_id: string
          competencia?: string | null
          concluded_at?: string | null
          concluded_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          document_id?: string | null
          document_request_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          plan_item_id?: string | null
          prazo?: string | null
          received_at?: string | null
          responsavel_profile_id?: string | null
          status?: string
          titulo: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          categoria?: string
          client_id?: string
          competencia?: string | null
          concluded_at?: string | null
          concluded_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          document_id?: string | null
          document_request_id?: string | null
          id?: string
          observacao?: string | null
          origem?: string
          plan_item_id?: string | null
          prazo?: string | null
          received_at?: string | null
          responsavel_profile_id?: string | null
          status?: string
          titulo?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "client_checklist_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_concluded_by_fkey"
            columns: ["concluded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_plan_item_id_fkey"
            columns: ["plan_item_id"]
            isOneToOne: false
            referencedRelation: "plan_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_checklist_items_responsavel_profile_id_fkey"
            columns: ["responsavel_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_collaborators: {
        Row: {
          client_id: string
          collaborator_id: string
          created_at: string
          id: string
        }
        Insert: {
          client_id: string
          collaborator_id: string
          created_at?: string
          id?: string
        }
        Update: {
          client_id?: string
          collaborator_id?: string
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
            foreignKeyName: "client_collaborators_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      client_commercial: {
        Row: {
          client_id: string
          created_at: string
          data_inicio: string | null
          data_ultimo_reajuste: string | null
          dia_vencimento: number | null
          id: string
          observacoes: string | null
          periodicidade: string
          plan_id: string | null
          plano: string | null
          proximo_reajuste: string | null
          status_comercial: string
          tipo_cliente: string
          updated_at: string
          valor_mensalidade: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          data_inicio?: string | null
          data_ultimo_reajuste?: string | null
          dia_vencimento?: number | null
          id?: string
          observacoes?: string | null
          periodicidade?: string
          plan_id?: string | null
          plano?: string | null
          proximo_reajuste?: string | null
          status_comercial?: string
          tipo_cliente: string
          updated_at?: string
          valor_mensalidade?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          data_inicio?: string | null
          data_ultimo_reajuste?: string | null
          dia_vencimento?: number | null
          id?: string
          observacoes?: string | null
          periodicidade?: string
          plan_id?: string | null
          plano?: string | null
          proximo_reajuste?: string | null
          status_comercial?: string
          tipo_cliente?: string
          updated_at?: string
          valor_mensalidade?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_commercial_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_commercial_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      client_fiscal_data: {
        Row: {
          client_id: string
          cnae_principal: string | null
          cnaes_secundarios: string | null
          created_at: string
          id: string
          inscricao_estadual: string | null
          inscricao_municipal: string | null
          municipio: string | null
          observacoes_contabeis: string | null
          observacoes_dp: string | null
          observacoes_fiscais: string | null
          observacoes_internas: string | null
          omie_cliente_id: string | null
          omie_last_synced_at: string | null
          omie_sync_error: string | null
          omie_sync_status: string | null
          possui_certificado_digital: boolean | null
          prefeitura_sistema: string | null
          regime_tributario: string | null
          responsavel_legal: string | null
          socios: string | null
          tipo_empresa: string | null
          uf: string | null
          updated_at: string
          validade_certificado_digital: string | null
        }
        Insert: {
          client_id: string
          cnae_principal?: string | null
          cnaes_secundarios?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          municipio?: string | null
          observacoes_contabeis?: string | null
          observacoes_dp?: string | null
          observacoes_fiscais?: string | null
          observacoes_internas?: string | null
          omie_cliente_id?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          possui_certificado_digital?: boolean | null
          prefeitura_sistema?: string | null
          regime_tributario?: string | null
          responsavel_legal?: string | null
          socios?: string | null
          tipo_empresa?: string | null
          uf?: string | null
          updated_at?: string
          validade_certificado_digital?: string | null
        }
        Update: {
          client_id?: string
          cnae_principal?: string | null
          cnaes_secundarios?: string | null
          created_at?: string
          id?: string
          inscricao_estadual?: string | null
          inscricao_municipal?: string | null
          municipio?: string | null
          observacoes_contabeis?: string | null
          observacoes_dp?: string | null
          observacoes_fiscais?: string | null
          observacoes_internas?: string | null
          omie_cliente_id?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          possui_certificado_digital?: boolean | null
          prefeitura_sistema?: string | null
          regime_tributario?: string | null
          responsavel_legal?: string | null
          socios?: string | null
          tipo_empresa?: string | null
          uf?: string | null
          updated_at?: string
          validade_certificado_digital?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_fiscal_data_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_month_status: {
        Row: {
          client_id: string
          competencia: string
          created_at: string
          id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          competencia: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          competencia?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_month_status_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_month_status_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_users: {
        Row: {
          ativo: boolean
          client_id: string
          created_at: string
          criado_por: string | null
          id: string
          papel: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          criado_por?: string | null
          id?: string
          papel?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          criado_por?: string | null
          id?: string
          papel?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_users_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          bairro: string | null
          capital_social: number | null
          cep: string | null
          cidade: string | null
          cnae_principal_codigo: string | null
          cnae_principal_descricao: string | null
          cnpj: string | null
          complemento: string | null
          created_at: string
          dados_receita_json: Json | null
          data_abertura: string | null
          data_entrada: string | null
          data_ultima_sincronizacao: string | null
          deleted_at: string | null
          deleted_by: string | null
          documento: string | null
          email: string | null
          id: string
          logradouro: string | null
          mei: boolean | null
          natureza_juridica: string | null
          nome_fantasia: string | null
          numero: string | null
          observacoes: string | null
          omie_id: string | null
          origem_cadastro: string
          owner_profile_id: string | null
          porte: string | null
          qsa_json: Json | null
          razao_social: string
          simples_nacional: boolean | null
          situacao_cadastral: string | null
          status: string
          telefone: string | null
          tipo: string | null
          uf: string | null
          ultima_consulta_receita: string | null
          updated_at: string
        }
        Insert: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          dados_receita_json?: Json | null
          data_abertura?: string | null
          data_entrada?: string | null
          data_ultima_sincronizacao?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          mei?: boolean | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          omie_id?: string | null
          origem_cadastro?: string
          owner_profile_id?: string | null
          porte?: string | null
          qsa_json?: Json | null
          razao_social: string
          simples_nacional?: boolean | null
          situacao_cadastral?: string | null
          status?: string
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          ultima_consulta_receita?: string | null
          updated_at?: string
        }
        Update: {
          bairro?: string | null
          capital_social?: number | null
          cep?: string | null
          cidade?: string | null
          cnae_principal_codigo?: string | null
          cnae_principal_descricao?: string | null
          cnpj?: string | null
          complemento?: string | null
          created_at?: string
          dados_receita_json?: Json | null
          data_abertura?: string | null
          data_entrada?: string | null
          data_ultima_sincronizacao?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          logradouro?: string | null
          mei?: boolean | null
          natureza_juridica?: string | null
          nome_fantasia?: string | null
          numero?: string | null
          observacoes?: string | null
          omie_id?: string | null
          origem_cadastro?: string
          owner_profile_id?: string | null
          porte?: string | null
          qsa_json?: Json | null
          razao_social?: string
          simples_nacional?: boolean | null
          situacao_cadastral?: string | null
          status?: string
          telefone?: string | null
          tipo?: string | null
          uf?: string | null
          ultima_consulta_receita?: string | null
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
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          status: string
          telefone: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          cargo?: string | null
          created_at?: string
          data_admissao?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_process_steps: {
        Row: {
          company_process_id: string
          concluida_dentro_prazo: boolean | null
          concluida_por: string | null
          created_at: string
          data_conclusao: string | null
          data_inicio: string | null
          departamento: string | null
          descricao: string | null
          exige_documento: boolean
          id: string
          nome: string
          notif_vence_em_breve_em: string | null
          notif_vencida_em: string | null
          obrigatoria: boolean
          observacoes: string | null
          ordem: number
          pode_concluir_manual: boolean
          prazo: string | null
          prazo_dias: number | null
          prazo_tipo: string
          process_step_id: string | null
          responsavel_id: string | null
          status: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          company_process_id: string
          concluida_dentro_prazo?: boolean | null
          concluida_por?: string | null
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          nome: string
          notif_vence_em_breve_em?: string | null
          notif_vencida_em?: string | null
          obrigatoria?: boolean
          observacoes?: string | null
          ordem?: number
          pode_concluir_manual?: boolean
          prazo?: string | null
          prazo_dias?: number | null
          prazo_tipo?: string
          process_step_id?: string | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          company_process_id?: string
          concluida_dentro_prazo?: boolean | null
          concluida_por?: string | null
          created_at?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          nome?: string
          notif_vence_em_breve_em?: string | null
          notif_vencida_em?: string | null
          obrigatoria?: boolean
          observacoes?: string | null
          ordem?: number
          pode_concluir_manual?: boolean
          prazo?: string | null
          prazo_dias?: number | null
          prazo_tipo?: string
          process_step_id?: string | null
          responsavel_id?: string | null
          status?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_process_steps_company_process_id_fkey"
            columns: ["company_process_id"]
            isOneToOne: false
            referencedRelation: "company_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_process_steps_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      company_processes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          data_abertura: string
          data_conclusao: string | null
          etapas_concluidas: number
          id: string
          motivo_espera: string | null
          observacoes: string | null
          prazo_final: string | null
          prioridade: string
          process_type_id: string
          progresso: number
          responsavel_id: string | null
          status: string
          status_changed_at: string
          total_etapas: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          etapas_concluidas?: number
          id?: string
          motivo_espera?: string | null
          observacoes?: string | null
          prazo_final?: string | null
          prioridade?: string
          process_type_id: string
          progresso?: number
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string
          total_etapas?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          data_abertura?: string
          data_conclusao?: string | null
          etapas_concluidas?: number
          id?: string
          motivo_espera?: string | null
          observacoes?: string | null
          prazo_final?: string | null
          prioridade?: string
          process_type_id?: string
          progresso?: number
          responsavel_id?: string | null
          status?: string
          status_changed_at?: string
          total_etapas?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_processes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_processes_process_type_id_fkey"
            columns: ["process_type_id"]
            isOneToOne: false
            referencedRelation: "process_types"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          attachment_final_name: string | null
          attachment_final_path: string | null
          categoria: string | null
          client_id: string
          competencia: string | null
          created_at: string
          criado_por: string | null
          criado_por_role: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
          departamento: string | null
          descricao: string | null
          document_id: string | null
          id: string
          observacoes_internas: string | null
          omie_documento_id: string | null
          omie_last_synced_at: string | null
          omie_sync_error: string | null
          omie_sync_status: string | null
          prazo: string | null
          responsavel_profile_id: string | null
          status: string
          tipo_solicitacao: string | null
          titulo: string
          updated_at: string
          urgencia: string
        }
        Insert: {
          attachment_final_name?: string | null
          attachment_final_path?: string | null
          categoria?: string | null
          client_id: string
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_role?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          departamento?: string | null
          descricao?: string | null
          document_id?: string | null
          id?: string
          observacoes_internas?: string | null
          omie_documento_id?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          prazo?: string | null
          responsavel_profile_id?: string | null
          status?: string
          tipo_solicitacao?: string | null
          titulo: string
          updated_at?: string
          urgencia?: string
        }
        Update: {
          attachment_final_name?: string | null
          attachment_final_path?: string | null
          categoria?: string | null
          client_id?: string
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_role?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          departamento?: string | null
          descricao?: string | null
          document_id?: string | null
          id?: string
          observacoes_internas?: string | null
          omie_documento_id?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          prazo?: string | null
          responsavel_profile_id?: string | null
          status?: string
          tipo_solicitacao?: string | null
          titulo?: string
          updated_at?: string
          urgencia?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_responsavel_profile_id_fkey"
            columns: ["responsavel_profile_id"]
            isOneToOne: false
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
          categoria_validade: string | null
          checklist_item_id: string | null
          client_id: string
          competencia: string | null
          created_at: string
          data_validade: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
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
          categoria_validade?: string | null
          checklist_item_id?: string | null
          client_id: string
          competencia?: string | null
          created_at?: string
          data_validade?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
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
          categoria_validade?: string | null
          checklist_item_id?: string | null
          client_id?: string
          competencia?: string | null
          created_at?: string
          data_validade?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
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
            foreignKeyName: "documents_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "client_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_deleted_by_fkey"
            columns: ["deleted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      message_templates: {
        Row: {
          assunto: string | null
          ativo: boolean
          categoria: string
          conteudo: string
          created_at: string
          created_by: string | null
          escopo: string
          id: string
          titulo: string
          updated_at: string
        }
        Insert: {
          assunto?: string | null
          ativo?: boolean
          categoria?: string
          conteudo: string
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          titulo: string
          updated_at?: string
        }
        Update: {
          assunto?: string | null
          ativo?: boolean
          categoria?: string
          conteudo?: string
          created_at?: string
          created_by?: string | null
          escopo?: string
          id?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: []
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
      omie_integration: {
        Row: {
          ambiente: string | null
          app_key: string | null
          app_secret: string | null
          created_at: string
          frequencia_sync: string | null
          id: string
          observacoes_internas: string | null
          proxima_sincronizacao: string | null
          responsavel_profile_id: string | null
          status: string
          sync_ativa: boolean
          ultima_sincronizacao: string | null
          updated_at: string
        }
        Insert: {
          ambiente?: string | null
          app_key?: string | null
          app_secret?: string | null
          created_at?: string
          frequencia_sync?: string | null
          id?: string
          observacoes_internas?: string | null
          proxima_sincronizacao?: string | null
          responsavel_profile_id?: string | null
          status?: string
          sync_ativa?: boolean
          ultima_sincronizacao?: string | null
          updated_at?: string
        }
        Update: {
          ambiente?: string | null
          app_key?: string | null
          app_secret?: string | null
          created_at?: string
          frequencia_sync?: string | null
          id?: string
          observacoes_internas?: string | null
          proxima_sincronizacao?: string | null
          responsavel_profile_id?: string | null
          status?: string
          sync_ativa?: boolean
          ultima_sincronizacao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "omie_integration_responsavel_profile_id_fkey"
            columns: ["responsavel_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      omie_integration_logs: {
        Row: {
          created_at: string
          detalhes: Json | null
          id: string
          mensagem: string | null
          modulo: string | null
          occurred_at: string
          status: string | null
          tipo_operacao: string | null
        }
        Insert: {
          created_at?: string
          detalhes?: Json | null
          id?: string
          mensagem?: string | null
          modulo?: string | null
          occurred_at?: string
          status?: string | null
          tipo_operacao?: string | null
        }
        Update: {
          created_at?: string
          detalhes?: Json | null
          id?: string
          mensagem?: string | null
          modulo?: string | null
          occurred_at?: string
          status?: string | null
          tipo_operacao?: string | null
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
          departamento: string | null
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
          departamento?: string | null
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
          departamento?: string | null
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
      plan_checklist_cron_log: {
        Row: {
          competencia: string
          criados: number
          empresas_processadas: number
          empresas_sem_plano: number
          erro: string | null
          executed_at: string
          id: string
          ignorados_existentes: number
          origem: string
        }
        Insert: {
          competencia: string
          criados?: number
          empresas_processadas?: number
          empresas_sem_plano?: number
          erro?: string | null
          executed_at?: string
          id?: string
          ignorados_existentes?: number
          origem?: string
        }
        Update: {
          competencia?: string
          criados?: number
          empresas_processadas?: number
          empresas_sem_plano?: number
          erro?: string | null
          executed_at?: string
          id?: string
          ignorados_existentes?: number
          origem?: string
        }
        Relationships: []
      }
      plan_items: {
        Row: {
          ativo: boolean
          categoria: string
          competencia_aplicavel: string
          created_at: string
          departamento: string | null
          descricao: string | null
          exige_documento: boolean
          id: string
          obrigatorio: boolean
          ordem: number
          plan_id: string
          pode_concluir_manual: boolean
          prazo_tipo: string
          prazo_valor: number | null
          titulo: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          ativo?: boolean
          categoria?: string
          competencia_aplicavel?: string
          created_at?: string
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          obrigatorio?: boolean
          ordem?: number
          plan_id: string
          pode_concluir_manual?: boolean
          prazo_tipo?: string
          prazo_valor?: number | null
          titulo: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          ativo?: boolean
          categoria?: string
          competencia_aplicavel?: string
          created_at?: string
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          obrigatorio?: boolean
          ordem?: number
          plan_id?: string
          pode_concluir_manual?: boolean
          prazo_tipo?: string
          prazo_valor?: number | null
          titulo?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          created_by: string | null
          descricao: string | null
          id: string
          nome: string
          periodicidade: string
          status: string
          tipo_cliente: string
          updated_at: string
          valor_padrao: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome: string
          periodicidade?: string
          status?: string
          tipo_cliente: string
          updated_at?: string
          valor_padrao?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          periodicidade?: string
          status?: string
          tipo_cliente?: string
          updated_at?: string
          valor_padrao?: number | null
        }
        Relationships: []
      }
      process_steps: {
        Row: {
          created_at: string
          departamento: string | null
          descricao: string | null
          exige_documento: boolean
          id: string
          nome: string
          obrigatoria: boolean
          ordem: number
          pode_concluir_manual: boolean
          prazo_dias: number | null
          prazo_tipo: string
          process_type_id: string
          responsavel_padrao_id: string | null
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          created_at?: string
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          nome: string
          obrigatoria?: boolean
          ordem?: number
          pode_concluir_manual?: boolean
          prazo_dias?: number | null
          prazo_tipo?: string
          process_type_id: string
          responsavel_padrao_id?: string | null
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          created_at?: string
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          nome?: string
          obrigatoria?: boolean
          ordem?: number
          pode_concluir_manual?: boolean
          prazo_dias?: number | null
          prazo_tipo?: string
          process_type_id?: string
          responsavel_padrao_id?: string | null
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_process_type_id_fkey"
            columns: ["process_type_id"]
            isOneToOne: false
            referencedRelation: "process_types"
            referencedColumns: ["id"]
          },
        ]
      }
      process_types: {
        Row: {
          categoria: string | null
          cor: string | null
          created_at: string
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          status: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          status?: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cor?: string | null
          created_at?: string
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          must_change_password: boolean
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
          must_change_password?: boolean
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
          must_change_password?: boolean
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tax_guides: {
        Row: {
          client_id: string
          competencia: string | null
          comprovante_path: string | null
          comprovante_uploaded_at: string | null
          comprovante_uploaded_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
          id: string
          nome_arquivo: string | null
          observacoes_internas: string | null
          omie_last_synced_at: string | null
          omie_sync_error: string | null
          omie_sync_status: string | null
          omie_titulo_id: string | null
          status: string
          storage_path: string | null
          tipo: string
          updated_at: string
          valor: number | null
          vencimento: string | null
        }
        Insert: {
          client_id: string
          competencia?: string | null
          comprovante_path?: string | null
          comprovante_uploaded_at?: string | null
          comprovante_uploaded_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          id?: string
          nome_arquivo?: string | null
          observacoes_internas?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          omie_titulo_id?: string | null
          status?: string
          storage_path?: string | null
          tipo: string
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Update: {
          client_id?: string
          competencia?: string | null
          comprovante_path?: string | null
          comprovante_uploaded_at?: string | null
          comprovante_uploaded_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          id?: string
          nome_arquivo?: string | null
          observacoes_internas?: string | null
          omie_last_synced_at?: string | null
          omie_sync_error?: string | null
          omie_sync_status?: string | null
          omie_titulo_id?: string | null
          status?: string
          storage_path?: string | null
          tipo?: string
          updated_at?: string
          valor?: number | null
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_guides_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_guides_comprovante_uploaded_by_fkey"
            columns: ["comprovante_uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_guides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      admin_create_client_with_user:
        | {
            Args: { _papel?: string; _payload: Json; _user_id: string }
            Returns: string
          }
        | {
            Args: {
              _collaborator_ids?: string[]
              _papel?: string
              _payload: Json
              _user_id: string
            }
            Returns: string
          }
      admin_find_profile_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      admin_restore_client: { Args: { _client_id: string }; Returns: undefined }
      admin_set_user_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_soft_delete_client: {
        Args: { _client_id: string }
        Returns: undefined
      }
      apply_plan_change: {
        Args: { _client_id: string; _mode: string; _new_plan_id: string }
        Returns: Json
      }
      apply_plan_item_to_current: {
        Args: { _plan_item_id: string }
        Returns: Json
      }
      calc_plan_item_prazo: {
        Args: { _competencia: string; _tipo: string; _valor: number }
        Returns: string
      }
      client_label: { Args: { _client_id: string }; Returns: string }
      client_staff_user_ids: { Args: { _client_id: string }; Returns: string[] }
      client_user_ids: { Args: { _client_id: string }; Returns: string[] }
      cron_generate_current_plan_checklist: { Args: never; Returns: Json }
      current_actor_role: { Args: never; Returns: string }
      generate_plan_checklist: { Args: { _competencia: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      mark_password_changed: { Args: never; Returns: undefined }
      notify_user: {
        Args: {
          _link: string
          _mensagem: string
          _tipo: string
          _titulo: string
          _user_id: string
        }
        Returns: undefined
      }
      open_company_process: {
        Args: {
          _client_id: string
          _observacoes?: string
          _prazo_final?: string
          _prioridade?: string
          _process_type_id: string
          _responsavel_id?: string
        }
        Returns: string
      }
      preview_plan_change: {
        Args: { _client_id: string; _competencia: string; _new_plan_id: string }
        Returns: Json
      }
      processos_notificar_vencimentos: { Args: never; Returns: Json }
      profiles_shares_client: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      recalc_company_process: {
        Args: { _process_id: string }
        Returns: undefined
      }
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
