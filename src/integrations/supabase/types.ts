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
          demo_batch_id: string | null
          document_id: string | null
          document_request_id: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          document_id?: string | null
          document_request_id?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          document_id?: string | null
          document_request_id?: string | null
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "client_checklist_items_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
          demo_batch_id: string | null
          id: string
          is_demo: boolean
        }
        Insert: {
          client_id: string
          collaborator_id: string
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
        }
        Update: {
          client_id?: string
          collaborator_id?: string
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
          {
            foreignKeyName: "client_collaborators_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
      client_competences: {
        Row: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          awaiting_client_note?: string | null
          awaiting_client_since?: string | null
          client_id: string
          competence: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          completion_summary?: Json | null
          created_at?: string
          created_by?: string | null
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          responsible_profile_id?: string | null
          review_requested_at?: string | null
          review_requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          awaiting_client_note?: string | null
          awaiting_client_since?: string | null
          client_id?: string
          competence?: string
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          completion_summary?: Json | null
          created_at?: string
          created_by?: string | null
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          responsible_profile_id?: string | null
          review_requested_at?: string | null
          review_requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_competences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competences_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competences_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competences_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competences_responsible_profile_id_fkey"
            columns: ["responsible_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competences_review_requested_by_fkey"
            columns: ["review_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          papel: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          client_id: string
          created_at?: string
          criado_por?: string | null
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          papel?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          client_id?: string
          created_at?: string
          criado_por?: string | null
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
          {
            foreignKeyName: "client_users_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
          demo_batch_id: string | null
          documento: string | null
          email: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          documento?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "clients_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
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
          demo_batch_id: string | null
          departamento: string | null
          email: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          departamento?: string | null
          email?: string | null
          id?: string
          is_demo?: boolean
          nome?: string
          observacoes?: string | null
          status?: string
          telefone?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_profile_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_process_documents: {
        Row: {
          company_process_id: string
          company_process_step_id: string | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          observacao: string | null
        }
        Insert: {
          company_process_id: string
          company_process_step_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          observacao?: string | null
        }
        Update: {
          company_process_id?: string
          company_process_step_id?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          observacao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_process_documents_company_process_id_fkey"
            columns: ["company_process_id"]
            isOneToOne: false
            referencedRelation: "company_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_process_documents_company_process_step_id_fkey"
            columns: ["company_process_step_id"]
            isOneToOne: false
            referencedRelation: "company_process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_process_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      company_process_step_requirements: {
        Row: {
          company_process_step_id: string
          created_at: string
          descricao: string | null
          descricao_publica: string | null
          document_id: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          nome: string
          nome_publico: string | null
          obrigatorio: boolean
          observacao: string | null
          ordem: number
          source_requirement_id: string | null
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          company_process_step_id: string
          created_at?: string
          descricao?: string | null
          descricao_publica?: string | null
          document_id?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          nome: string
          nome_publico?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          source_requirement_id?: string | null
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          company_process_step_id?: string
          created_at?: string
          descricao?: string | null
          descricao_publica?: string | null
          document_id?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          nome?: string
          nome_publico?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          source_requirement_id?: string | null
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "company_process_step_requirements_company_process_step_id_fkey"
            columns: ["company_process_step_id"]
            isOneToOne: false
            referencedRelation: "company_process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_process_step_requirements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_process_step_requirements_source_requirement_id_fkey"
            columns: ["source_requirement_id"]
            isOneToOne: false
            referencedRelation: "process_step_requirements"
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
          demo_batch_id: string | null
          departamento: string | null
          descricao: string | null
          descricao_publica: string | null
          exige_documento: boolean
          id: string
          is_demo: boolean
          nome: string
          nome_publico: string | null
          notif_vence_em_breve_em: string | null
          notif_vencida_em: string | null
          obrigatoria: boolean
          observacao_publica: string | null
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          descricao_publica?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
          nome: string
          nome_publico?: string | null
          notif_vence_em_breve_em?: string | null
          notif_vencida_em?: string | null
          obrigatoria?: boolean
          observacao_publica?: string | null
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          descricao_publica?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
          nome?: string
          nome_publico?: string | null
          notif_vence_em_breve_em?: string | null
          notif_vencida_em?: string | null
          obrigatoria?: boolean
          observacao_publica?: string | null
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
            foreignKeyName: "company_process_steps_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
          demo_batch_id: string | null
          etapas_concluidas: number
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          etapas_concluidas?: number
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          etapas_concluidas?: number
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "company_processes_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
      competence_generation_runs: {
        Row: {
          analyzed: number
          competence: string
          created: number
          created_ids: string[]
          duration_ms: number | null
          errors: Json
          executor_profile_id: string | null
          existed: number
          finished_at: string | null
          id: string
          include_demo: boolean
          missing_responsible: number
          scope: string
          skipped: number
          source: string
          started_at: string
        }
        Insert: {
          analyzed?: number
          competence: string
          created?: number
          created_ids?: string[]
          duration_ms?: number | null
          errors?: Json
          executor_profile_id?: string | null
          existed?: number
          finished_at?: string | null
          id?: string
          include_demo?: boolean
          missing_responsible?: number
          scope?: string
          skipped?: number
          source: string
          started_at?: string
        }
        Update: {
          analyzed?: number
          competence?: string
          created?: number
          created_ids?: string[]
          duration_ms?: number | null
          errors?: Json
          executor_profile_id?: string | null
          existed?: number
          finished_at?: string | null
          id?: string
          include_demo?: boolean
          missing_responsible?: number
          scope?: string
          skipped?: number
          source?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "competence_generation_runs_executor_profile_id_fkey"
            columns: ["executor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_audit_log: {
        Row: {
          action: string
          admin_id: string | null
          batch_id: string | null
          created_at: string
          id: string
          payload_json: Json
        }
        Insert: {
          action: string
          admin_id?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          payload_json?: Json
        }
        Update: {
          action?: string
          admin_id?: string | null
          batch_id?: string | null
          created_at?: string
          id?: string
          payload_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "demo_audit_log_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_batches: {
        Row: {
          counts_json: Json
          created_at: string
          created_by: string | null
          id: string
          label: string
          status: string
          updated_at: string
        }
        Insert: {
          counts_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label: string
          status?: string
          updated_at?: string
        }
        Update: {
          counts_json?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      demo_manual_test_steps: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          persona_email: string
          persona_label: string
          persona_role: string
          run_id: string
          status: string
          step_code: string
          step_label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          persona_email: string
          persona_label: string
          persona_role: string
          run_id: string
          status?: string
          step_code: string
          step_label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          persona_email?: string
          persona_label?: string
          persona_role?: string
          run_id?: string
          status?: string
          step_code?: string
          step_label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_manual_test_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "demo_validation_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_validation_runs: {
        Row: {
          admin_id: string
          batch_id: string
          checks_json: Json
          counts_json: Json
          created_at: string
          id: string
          overall: string
          run_label: string | null
        }
        Insert: {
          admin_id: string
          batch_id: string
          checks_json?: Json
          counts_json?: Json
          created_at?: string
          id?: string
          overall: string
          run_label?: string | null
        }
        Update: {
          admin_id?: string
          batch_id?: string
          checks_json?: Json
          counts_json?: Json
          created_at?: string
          id?: string
          overall?: string
          run_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demo_validation_runs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
          company_process_id: string | null
          company_process_step_id: string | null
          company_process_step_requirement_id: string | null
          competencia: string | null
          created_at: string
          criado_por: string | null
          criado_por_role: string | null
          deleted_at: string | null
          deleted_by: string | null
          deleted_by_role: string | null
          deletion_reason: string | null
          demo_batch_id: string | null
          departamento: string | null
          descricao: string | null
          document_id: string | null
          id: string
          is_demo: boolean
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
          company_process_id?: string | null
          company_process_step_id?: string | null
          company_process_step_requirement_id?: string | null
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_role?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          document_id?: string | null
          id?: string
          is_demo?: boolean
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
          company_process_id?: string | null
          company_process_step_id?: string | null
          company_process_step_requirement_id?: string | null
          competencia?: string | null
          created_at?: string
          criado_por?: string | null
          criado_por_role?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_by_role?: string | null
          deletion_reason?: string | null
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          document_id?: string | null
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "document_requests_company_process_id_fkey"
            columns: ["company_process_id"]
            isOneToOne: false
            referencedRelation: "company_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_company_process_step_id_fkey"
            columns: ["company_process_step_id"]
            isOneToOne: false
            referencedRelation: "company_process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_company_process_step_requirement_id_fkey"
            columns: ["company_process_step_requirement_id"]
            isOneToOne: false
            referencedRelation: "company_process_step_requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
          demo_batch_id: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "documents_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
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
      mcp_audit_log: {
        Row: {
          created_at: string
          duration_ms: number
          error_message: string | null
          id: string
          result_count: number | null
          success: boolean
          tool_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          duration_ms: number
          error_message?: string | null
          id?: string
          result_count?: number | null
          success: boolean
          tool_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          duration_ms?: number
          error_message?: string | null
          id?: string
          result_count?: number | null
          success?: boolean
          tool_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          lida: boolean
          link: string | null
          mensagem: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo: string
          titulo: string
          user_id: string
        }
        Update: {
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          lida?: boolean
          link?: string | null
          mensagem?: string | null
          tipo?: string
          titulo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
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
          demo_batch_id: string | null
          departamento: string | null
          descricao: string | null
          exige_documento: boolean
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
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
            foreignKeyName: "plan_items_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
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
          demo_batch_id: string | null
          descricao: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          descricao?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          descricao?: string | null
          id?: string
          is_demo?: boolean
          nome?: string
          periodicidade?: string
          status?: string
          tipo_cliente?: string
          updated_at?: string
          valor_padrao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      process_step_requirements: {
        Row: {
          created_at: string
          descricao: string | null
          descricao_publica: string | null
          id: string
          nome: string
          nome_publico: string | null
          obrigatorio: boolean
          observacao: string | null
          ordem: number
          process_step_id: string
          updated_at: string
          visivel_cliente: boolean
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          descricao_publica?: string | null
          id?: string
          nome: string
          nome_publico?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          process_step_id: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Update: {
          created_at?: string
          descricao?: string | null
          descricao_publica?: string | null
          id?: string
          nome?: string
          nome_publico?: string | null
          obrigatorio?: boolean
          observacao?: string | null
          ordem?: number
          process_step_id?: string
          updated_at?: string
          visivel_cliente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "process_step_requirements_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      process_steps: {
        Row: {
          created_at: string
          demo_batch_id: string | null
          departamento: string | null
          descricao: string | null
          descricao_publica: string | null
          exige_documento: boolean
          id: string
          is_demo: boolean
          nome: string
          nome_publico: string | null
          obrigatoria: boolean
          observacao_publica: string | null
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          descricao_publica?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
          nome: string
          nome_publico?: string | null
          obrigatoria?: boolean
          observacao_publica?: string | null
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
          demo_batch_id?: string | null
          departamento?: string | null
          descricao?: string | null
          descricao_publica?: string | null
          exige_documento?: boolean
          id?: string
          is_demo?: boolean
          nome?: string
          nome_publico?: string | null
          obrigatoria?: boolean
          observacao_publica?: string | null
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
            foreignKeyName: "process_steps_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
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
          demo_batch_id: string | null
          descricao: string | null
          icone: string | null
          id: string
          is_demo: boolean
          nome: string
          ordem: number
          status: string
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          cor?: string | null
          created_at?: string
          demo_batch_id?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          is_demo?: boolean
          nome: string
          ordem?: number
          status?: string
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          cor?: string | null
          created_at?: string
          demo_batch_id?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          is_demo?: boolean
          nome?: string
          ordem?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_types_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          demo_batch_id: string | null
          email: string | null
          full_name: string
          id: string
          is_demo: boolean
          must_change_password: boolean
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          demo_batch_id?: string | null
          email?: string | null
          full_name?: string
          id: string
          is_demo?: boolean
          must_change_password?: boolean
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          demo_batch_id?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_demo?: boolean
          must_change_password?: boolean
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
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
          demo_batch_id: string | null
          id: string
          is_demo: boolean
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
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
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
          {
            foreignKeyName: "tax_guides_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          actor_profile_id: string | null
          client_id: string | null
          created_at: string
          demo_batch_id: string | null
          descricao: string
          id: string
          is_demo: boolean
          metadata: Json | null
          tipo: string
        }
        Insert: {
          actor_profile_id?: string | null
          client_id?: string | null
          created_at?: string
          demo_batch_id?: string | null
          descricao: string
          id?: string
          is_demo?: boolean
          metadata?: Json | null
          tipo: string
        }
        Update: {
          actor_profile_id?: string | null
          client_id?: string | null
          created_at?: string
          demo_batch_id?: string | null
          descricao?: string
          id?: string
          is_demo?: boolean
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
          {
            foreignKeyName: "timeline_events_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          demo_batch_id?: string | null
          id?: string
          is_demo?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_demo_batch_id_fkey"
            columns: ["demo_batch_id"]
            isOneToOne: false
            referencedRelation: "demo_batches"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _competence_admin_or_service: { Args: never; Returns: boolean }
      _competence_check_transition: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      _competence_log: {
        Args: {
          p_actor: string
          p_client_id: string
          p_descricao: string
          p_meta: Json
          p_tipo: string
        }
        Returns: undefined
      }
      _competence_validate_responsible: {
        Args: { p_client_id: string; p_profile_id: string }
        Returns: undefined
      }
      admin_bulk_assign_responsible: {
        Args: { p_ids: string[]; p_profile_id: string }
        Returns: Json
      }
      admin_bulk_competence_start: { Args: { p_ids: string[] }; Returns: Json }
      admin_bulk_set_model_visibility: {
        Args: {
          _include_requirements?: boolean
          _process_type_id: string
          _visible: boolean
        }
        Returns: Json
      }
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
      admin_demo_contamination_report: { Args: never; Returns: Json }
      admin_demo_create_environment: {
        Args: { _label?: string }
        Returns: Json
      }
      admin_demo_list_manual_steps: {
        Args: { _run_id: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          persona_email: string
          persona_label: string
          persona_role: string
          run_id: string
          status: string
          step_code: string
          step_label: string
          updated_at: string
          updated_by: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "demo_manual_test_steps"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_demo_list_validation_runs: {
        Args: { _batch_id?: string }
        Returns: {
          admin_id: string
          batch_id: string
          checks_json: Json
          counts_json: Json
          created_at: string
          id: string
          overall: string
          run_label: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "demo_validation_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_demo_orphan_auth_user_ids: {
        Args: never
        Returns: {
          email: string
          user_id: string
        }[]
      }
      admin_demo_persona_user_ids: {
        Args: { _batch_id?: string }
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
      admin_demo_repair_case_a: { Args: never; Returns: Json }
      admin_demo_reset: { Args: { _label?: string }; Returns: Json }
      admin_demo_seed_batch: {
        Args: { _label: string; _personas: Json }
        Returns: Json
      }
      admin_demo_summary: { Args: never; Returns: Json }
      admin_demo_update_manual_step: {
        Args: { _notes?: string; _status: string; _step_id: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          persona_email: string
          persona_label: string
          persona_role: string
          run_id: string
          status: string
          step_code: string
          step_label: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "demo_manual_test_steps"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_demo_validate_batch: { Args: { p_batch_id: string }; Returns: Json }
      admin_demo_wipe: { Args: { _batch_id?: string }; Returns: Json }
      admin_demo_wipe_preview: { Args: { _batch_id?: string }; Returns: Json }
      admin_duplicate_process_type: {
        Args: {
          _descricao?: string
          _nome: string
          _source: string
          _status?: string
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
      admin_generate_monthly_competences: {
        Args: { p_competence: string; p_scope?: string; p_source?: string }
        Returns: Json
      }
      admin_generate_monthly_competences_preview: {
        Args: { p_competence: string; p_scope?: string }
        Returns: {
          client_id: string
          is_demo: boolean
          razao_social: string
          responsible_name: string
          responsible_profile_id: string
          situacao: string
        }[]
      }
      admin_import_model_config: {
        Args: { _source: string; _target: string }
        Returns: Json
      }
      admin_process_models_stats: {
        Args: never
        Returns: {
          etapas_publicas: number
          etapas_total: number
          process_type_id: string
          processos_ativos: number
          processos_total: number
          requisitos_publicos: number
          requisitos_total: number
          ultima_alteracao: string
          ultima_sincronizacao: string
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
      admin_sync_process_visibility: {
        Args: { _dry_run?: boolean; _mode: string; _process_type_id: string }
        Returns: Json
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
      client_list_processes: {
        Args: never
        Returns: {
          aguardando_minha_acao: boolean
          client_id: string
          data_abertura: string
          empresa: string
          id: string
          motivo_espera: string
          prazo_final: string
          progresso_concluido: number
          progresso_total: number
          status: string
          tipo_nome: string
        }[]
      }
      client_process_detail: { Args: { _id: string }; Returns: Json }
      client_process_timeline: {
        Args: { _id: string }
        Returns: {
          created_at: string
          descricao: string
          id: string
          metadata: Json
          tipo: string
        }[]
      }
      client_staff_user_ids: { Args: { _client_id: string }; Returns: string[] }
      client_user_ids: { Args: { _client_id: string }; Returns: string[] }
      collaborator_visible_to_user: {
        Args: { _collab_id: string; _user_id: string }
        Returns: boolean
      }
      competence_change_responsible: {
        Args: { p_id: string; p_new_responsible: string }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      competence_change_status: {
        Args: { p_id: string; p_new_status: string; p_note?: string }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      competence_complete: {
        Args: {
          p_accepted_alerts?: Json
          p_id: string
          p_justification?: string
          p_notes?: string
        }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      competence_evaluate: {
        Args: { p_client_id: string; p_competence: string; p_phase: string }
        Returns: Json
      }
      competence_reopen: {
        Args: { p_id: string; p_reason: string }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      competence_send_to_review: {
        Args: {
          p_accepted_alerts?: Json
          p_id: string
          p_justification?: string
        }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      competence_start: {
        Args: {
          p_client_id: string
          p_competence: string
          p_responsible?: string
        }
        Returns: {
          awaiting_client_note: string | null
          awaiting_client_since: string | null
          client_id: string
          competence: string
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          completion_summary: Json | null
          created_at: string
          created_by: string | null
          demo_batch_id: string | null
          id: string
          is_demo: boolean
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          responsible_profile_id: string | null
          review_requested_at: string | null
          review_requested_by: string | null
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "client_competences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cron_generate_current_plan_checklist: { Args: never; Returns: Json }
      current_actor_role: { Args: never; Returns: string }
      generate_plan_checklist: { Args: { _competencia: string }; Returns: Json }
      get_client_competence_history: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: {
          competence: string
          reopened: boolean
          status: string
          updated_at: string
        }[]
      }
      get_client_competence_portal: {
        Args: { p_client_id: string; p_competence: string }
        Returns: Json
      }
      get_competence_overview: {
        Args: { p_competence: string }
        Returns: {
          checklist_cancelado: number
          checklist_concluido: number
          checklist_pendente: number
          checklist_recebido: number
          checklist_total: number
          client_id: string
          doc_total: number
          guias_com_comprovante: number
          guias_proximas: number
          guias_sem_comprovante: number
          guias_total: number
          guias_vencidas: number
          is_demo: boolean
          nome_fantasia: string
          pend_abertas: number
          pend_aguardando_cliente: number
          pend_concluidas: number
          pend_vencidas: number
          proc_aguardando_cliente: number
          proc_ativos: number
          proc_atrasados: number
          proc_concluidos: number
          razao_social: string
          responsavel_nome: string
          sol_aguardando_cliente: number
          sol_concluidas: number
          sol_em_analise: number
          sol_total: number
        }[]
      }
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
      open_company_process:
        | {
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
        | {
            Args: {
              _client_id: string
              _demo_batch_id?: string
              _is_demo?: boolean
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
      processos_indicadores: { Args: never; Returns: Json }
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
      user_owns_collaborator: {
        Args: { _collab_id: string; _user_id: string }
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
