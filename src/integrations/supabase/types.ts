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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      accountant_contacts: {
        Row: {
          auto_send: boolean
          email: string
          name: string
          owner_id: string
          send_day: number
          updated_at: string
        }
        Insert: {
          auto_send?: boolean
          email?: string
          name?: string
          owner_id: string
          send_day?: number
          updated_at?: string
        }
        Update: {
          auto_send?: boolean
          email?: string
          name?: string
          owner_id?: string
          send_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      accountant_uploads: {
        Row: {
          consumed_at: string | null
          file_name: string
          file_path: string
          id: string
          link_id: string
          mime_type: string
          owner_id: string
          size_bytes: number
          uploaded_at: string
        }
        Insert: {
          consumed_at?: string | null
          file_name: string
          file_path: string
          id?: string
          link_id: string
          mime_type: string
          owner_id: string
          size_bytes: number
          uploaded_at?: string
        }
        Update: {
          consumed_at?: string | null
          file_name?: string
          file_path?: string
          id?: string
          link_id?: string
          mime_type?: string
          owner_id?: string
          size_bytes?: number
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accountant_uploads_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "upload_links"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          archived: boolean
          created_at: string
          credit_limit: number | null
          details: Json
          due_day: number | null
          id: string
          include_in_cash: boolean
          interest_rate: number | null
          issuer: string
          kind: string
          last_four: string | null
          min_balance: number
          name: string
          opening_balance: number
          owner_id: string
          statement_day: number | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          credit_limit?: number | null
          details?: Json
          due_day?: number | null
          id?: string
          include_in_cash?: boolean
          interest_rate?: number | null
          issuer?: string
          kind?: string
          last_four?: string | null
          min_balance?: number
          name: string
          opening_balance?: number
          owner_id: string
          statement_day?: number | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          credit_limit?: number | null
          details?: Json
          due_day?: number | null
          id?: string
          include_in_cash?: boolean
          interest_rate?: number | null
          issuer?: string
          kind?: string
          last_four?: string | null
          min_balance?: number
          name?: string
          opening_balance?: number
          owner_id?: string
          statement_day?: number | null
        }
        Relationships: []
      }
      asset_valuations: {
        Row: {
          account_id: string
          created_at: string
          id: string
          note: string
          owner_id: string
          source: string
          value: number
          valued_on: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          note?: string
          owner_id: string
          source?: string
          value: number
          valued_on: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          note?: string
          owner_id?: string
          source?: string
          value?: number
          valued_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_valuations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      category_batches: {
        Row: {
          category: string
          created_at: string
          entries: Json
          id: string
          owner_id: string
          undone_at: string | null
        }
        Insert: {
          category: string
          created_at?: string
          entries: Json
          id?: string
          owner_id: string
          undone_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          entries?: Json
          id?: string
          owner_id?: string
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_batches_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      category_budgets: {
        Row: {
          category: string
          monthly_amount: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          category: string
          monthly_amount?: number
          owner_id: string
          updated_at?: string
        }
        Update: {
          category?: string
          monthly_amount?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      claim_preparations: {
        Row: {
          created_at: string
          data: Json
          id: string
          mutation_id: string
          owner_id: string
          revision: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          mutation_id: string
          owner_id: string
          revision?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          mutation_id?: string
          owner_id?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "claim_preparation_owner"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "finance_preferences"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      commitments: {
        Row: {
          account_id: string | null
          amount: number
          category: string
          confirmed: boolean
          created_at: string
          direction: string
          essential: boolean
          frequency: string
          id: string
          interval_days: number | null
          kind: string
          name: string
          next_due: string
          owner_id: string
          status: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string
          confirmed?: boolean
          created_at?: string
          direction?: string
          essential?: boolean
          frequency?: string
          id?: string
          interval_days?: number | null
          kind?: string
          name: string
          next_due: string
          owner_id: string
          status?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string
          confirmed?: boolean
          created_at?: string
          direction?: string
          essential?: boolean
          frequency?: string
          id?: string
          interval_days?: number | null
          kind?: string
          name?: string
          next_due?: string
          owner_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "commitments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      demat_accounts: {
        Row: {
          broker: string
          client_id: string
          created_at: string
          dp_id: string
          holder: string
          id: string
          owner_id: string
        }
        Insert: {
          broker?: string
          client_id?: string
          created_at?: string
          dp_id?: string
          holder?: string
          id?: string
          owner_id?: string
        }
        Update: {
          broker?: string
          client_id?: string
          created_at?: string
          dp_id?: string
          holder?: string
          id?: string
          owner_id?: string
        }
        Relationships: []
      }
      demo_sessions: {
        Row: {
          created_at: string
          label: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          label: string
          owner_id: string
        }
        Update: {
          created_at?: string
          label?: string
          owner_id?: string
        }
        Relationships: []
      }
      department_budgets: {
        Row: {
          amount: number
          department: string
          updated_at: string
        }
        Insert: {
          amount?: number
          department: string
          updated_at?: string
        }
        Update: {
          amount?: number
          department?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_passkeys: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          owner_id: string
          public_key: string
          transports: Json
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          owner_id: string
          public_key: string
          transports?: Json
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          owner_id?: string
          public_key?: string
          transports?: Json
        }
        Relationships: []
      }
      document_runs: {
        Row: {
          attempts: number
          context: string
          created_at: string
          data: Json
          document_id: string | null
          error: string | null
          file_name: string
          id: string
          owner_id: string
          stage: string
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          context?: string
          created_at?: string
          data?: Json
          document_id?: string | null
          error?: string | null
          file_name: string
          id: string
          owner_id: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          context?: string
          created_at?: string
          data?: Json
          document_id?: string | null
          error?: string | null
          file_name?: string
          id?: string
          owner_id?: string
          stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string
          currency: string
          doc_date: string | null
          doc_type: string
          evidence_locked: boolean
          expires_on: string | null
          extracted_text: string
          fields: Json
          file_name: string
          file_path: string
          id: string
          loan_id: string | null
          merchant: string | null
          mime_type: string
          notes: string
          owner_id: string
          replaces_id: string | null
          size_bytes: number
          title: string
          transaction_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string
          doc_date?: string | null
          doc_type?: string
          evidence_locked?: boolean
          expires_on?: string | null
          extracted_text?: string
          fields?: Json
          file_name: string
          file_path: string
          id?: string
          loan_id?: string | null
          merchant?: string | null
          mime_type?: string
          notes?: string
          owner_id: string
          replaces_id?: string | null
          size_bytes?: number
          title: string
          transaction_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number | null
          created_at?: string
          currency?: string
          doc_date?: string | null
          doc_type?: string
          evidence_locked?: boolean
          expires_on?: string | null
          extracted_text?: string
          fields?: Json
          file_name?: string
          file_path?: string
          id?: string
          loan_id?: string | null
          merchant?: string | null
          mime_type?: string
          notes?: string
          owner_id?: string
          replaces_id?: string | null
          size_bytes?: number
          title?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_replaces_id_fkey"
            columns: ["replaces_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_drafts: {
        Row: {
          created_at: string
          data: Json
          id: string
          owner_id: string
          receipts: Json
          status: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id: string
          owner_id?: string
          receipts?: Json
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          owner_id?: string
          receipts?: Json
          status?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      expense_history: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          expense_id: string
          id: string
          note: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          expense_id: string
          id?: string
          note?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          expense_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_history_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          adjustment_sign: number
          allocations: Json
          amount: number
          category: string
          category_revision: number
          correction_revision: number
          created_at: string
          currency: string
          department: string | null
          description: string
          employee_id: string
          expense_date: string
          fx_date: string | null
          fx_rate: number
          id: string
          interest: number | null
          member_id: string | null
          merchant: string | null
          original_amount: number | null
          payee_id: string | null
          payment_instrument_id: string | null
          payment_method: string
          principal: number | null
          receipt_details: Json
          receipts: Json
          reconciled_at: string | null
          reconciled_by: string | null
          reimbursement: Json
          reimbursement_status: string
          scope: string
          splits: Json
          statement_ref: string | null
          status: string
          tags: string[]
          title: string
          to_account_id: string | null
          transfer_counterpart_of: string | null
          trip_id: string | null
          txn_type: string
          updated_at: string
          workspace_allocations: Json
        }
        Insert: {
          account_id?: string | null
          adjustment_sign?: number
          allocations?: Json
          amount: number
          category: string
          category_revision?: number
          correction_revision?: number
          created_at?: string
          currency?: string
          department?: string | null
          description?: string
          employee_id: string
          expense_date: string
          fx_date?: string | null
          fx_rate?: number
          id?: string
          interest?: number | null
          member_id?: string | null
          merchant?: string | null
          original_amount?: number | null
          payee_id?: string | null
          payment_instrument_id?: string | null
          payment_method?: string
          principal?: number | null
          receipt_details?: Json
          receipts?: Json
          reconciled_at?: string | null
          reconciled_by?: string | null
          reimbursement?: Json
          reimbursement_status?: string
          scope?: string
          splits?: Json
          statement_ref?: string | null
          status?: string
          tags?: string[]
          title: string
          to_account_id?: string | null
          transfer_counterpart_of?: string | null
          trip_id?: string | null
          txn_type?: string
          updated_at?: string
          workspace_allocations?: Json
        }
        Update: {
          account_id?: string | null
          adjustment_sign?: number
          allocations?: Json
          amount?: number
          category?: string
          category_revision?: number
          correction_revision?: number
          created_at?: string
          currency?: string
          department?: string | null
          description?: string
          employee_id?: string
          expense_date?: string
          fx_date?: string | null
          fx_rate?: number
          id?: string
          interest?: number | null
          member_id?: string | null
          merchant?: string | null
          original_amount?: number | null
          payee_id?: string | null
          payment_instrument_id?: string | null
          payment_method?: string
          principal?: number | null
          receipt_details?: Json
          receipts?: Json
          reconciled_at?: string | null
          reconciled_by?: string | null
          reimbursement?: Json
          reimbursement_status?: string
          scope?: string
          splits?: Json
          statement_ref?: string | null
          status?: string
          tags?: string[]
          title?: string
          to_account_id?: string | null
          transfer_counterpart_of?: string | null
          trip_id?: string | null
          txn_type?: string
          updated_at?: string
          workspace_allocations?: Json
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      family_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          id: string
          member_id: string
          owner_id: string
          revoked: boolean
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          id?: string
          member_id: string
          owner_id: string
          revoked?: boolean
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          id?: string
          member_id?: string
          owner_id?: string
          revoked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          relation: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
          relation?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          relation?: string
        }
        Relationships: []
      }
      family_requests: {
        Row: {
          amount: number
          category: string
          created_at: string
          decided_at: string | null
          decision_note: string
          evidence_name: string | null
          evidence_path: string | null
          id: string
          invite_id: string
          needed_by: string | null
          note: string
          owner_id: string
          requester_id: string
          status: string
          title: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string
          evidence_name?: string | null
          evidence_path?: string | null
          id?: string
          invite_id: string
          needed_by?: string | null
          note?: string
          owner_id: string
          requester_id: string
          status?: string
          title: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string
          evidence_name?: string | null
          evidence_path?: string | null
          id?: string
          invite_id?: string
          needed_by?: string | null
          note?: string
          owner_id?: string
          requester_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_requests_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "family_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_operations: {
        Row: {
          created_at: string
          operation_key: string
          owner_id: string
          result: Json
        }
        Insert: {
          created_at?: string
          operation_key: string
          owner_id: string
          result?: Json
        }
        Update: {
          created_at?: string
          operation_key?: string
          owner_id?: string
          result?: Json
        }
        Relationships: []
      }
      finance_preferences: {
        Row: {
          data: Json
          owner_id: string
          updated_at: string
        }
        Insert: {
          data?: Json
          owner_id: string
          updated_at?: string
        }
        Update: {
          data?: Json
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_corrections: {
        Row: {
          created_at: string
          entries: Json
          id: string
          owner_id: string
          request: Json
          undone_at: string | null
        }
        Insert: {
          created_at?: string
          entries: Json
          id: string
          owner_id: string
          request: Json
          undone_at?: string | null
        }
        Update: {
          created_at?: string
          entries?: Json
          id?: string
          owner_id?: string
          request?: Json
          undone_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_corrections_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "finance_preferences"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          id: string
          monthly: number
          name: string
          owner_id: string
          reserve: boolean
          saved: number
          target: number
        }
        Insert: {
          created_at?: string
          id?: string
          monthly?: number
          name: string
          owner_id: string
          reserve?: boolean
          saved?: number
          target: number
        }
        Update: {
          created_at?: string
          id?: string
          monthly?: number
          name?: string
          owner_id?: string
          reserve?: boolean
          saved?: number
          target?: number
        }
        Relationships: []
      }
      import_ai_state: {
        Row: {
          lease_until: string
          owner_id: string
          pause_kind: string | null
          paused: boolean
          reason: string | null
        }
        Insert: {
          lease_until?: string
          owner_id: string
          pause_kind?: string | null
          paused?: boolean
          reason?: string | null
        }
        Update: {
          lease_until?: string
          owner_id?: string
          pause_kind?: string | null
          paused?: boolean
          reason?: string | null
        }
        Relationships: []
      }
      import_audit: {
        Row: {
          action: string
          batch_id: string
          created_at: string
          details: Json
          id: string
          owner_id: string
        }
        Insert: {
          action: string
          batch_id: string
          created_at?: string
          details?: Json
          id?: string
          owner_id?: string
        }
        Update: {
          action?: string
          batch_id?: string
          created_at?: string
          details?: Json
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_batches: {
        Row: {
          account_id: string
          allow_ai: boolean
          attempts: number
          balance_verification: Json
          closing_balance: number | null
          created_at: string
          currency: string
          error: string | null
          file_hash: string
          file_name: string
          file_path: string
          id: string
          lease_until: string
          next_page: number
          opening_balance: number | null
          owner_id: string
          period_from: string | null
          period_to: string | null
          raw_lines: Json
          source_balances: Json
          statement_identity: Json
          statement_review: Json
          status: string
          total_pages: number | null
          updated_at: string
        }
        Insert: {
          account_id: string
          allow_ai?: boolean
          attempts?: number
          balance_verification?: Json
          closing_balance?: number | null
          created_at?: string
          currency?: string
          error?: string | null
          file_hash: string
          file_name: string
          file_path: string
          id?: string
          lease_until?: string
          next_page?: number
          opening_balance?: number | null
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          raw_lines?: Json
          source_balances?: Json
          statement_identity?: Json
          statement_review?: Json
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          allow_ai?: boolean
          attempts?: number
          balance_verification?: Json
          closing_balance?: number | null
          created_at?: string
          currency?: string
          error?: string | null
          file_hash?: string
          file_name?: string
          file_path?: string
          id?: string
          lease_until?: string
          next_page?: number
          opening_balance?: number | null
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          raw_lines?: Json
          source_balances?: Json
          statement_identity?: Json
          statement_review?: Json
          status?: string
          total_pages?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      import_pdf_pages: {
        Row: {
          balances: Json
          batch_id: string
          created_at: string
          owner_id: string
          page_end: number
          page_start: number
          rows: Json
          run_id: string | null
        }
        Insert: {
          balances: Json
          batch_id: string
          created_at?: string
          owner_id: string
          page_end: number
          page_start: number
          rows: Json
          run_id?: string | null
        }
        Update: {
          balances?: Json
          batch_id?: string
          created_at?: string
          owner_id?: string
          page_end?: number
          page_start?: number
          rows?: Json
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_pdf_pages_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_posts: {
        Row: {
          account_id: string
          batch_id: string | null
          fingerprint: string
          original_line: Json
          owner_id: string
          posted_at: string
          transaction_id: string
        }
        Insert: {
          account_id: string
          batch_id?: string | null
          fingerprint: string
          original_line: Json
          owner_id: string
          posted_at?: string
          transaction_id: string
        }
        Update: {
          account_id?: string
          batch_id?: string | null
          fingerprint?: string
          original_line?: Json
          owner_id?: string
          posted_at?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_posts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_posts_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rows: {
        Row: {
          batch_id: string
          confidence: string
          created_at: string
          decision: string
          duplicate_id: string | null
          duplicate_kind: string
          fingerprint: string
          id: string
          line: Json
          owner_id: string
          proposal: Json
          review_group: string
          updated_at: string
        }
        Insert: {
          batch_id: string
          confidence?: string
          created_at?: string
          decision?: string
          duplicate_id?: string | null
          duplicate_kind?: string
          fingerprint: string
          id?: string
          line: Json
          owner_id?: string
          proposal: Json
          review_group: string
          updated_at?: string
        }
        Update: {
          batch_id?: string
          confidence?: string
          created_at?: string
          decision?: string
          duplicate_id?: string | null
          duplicate_kind?: string
          fingerprint?: string
          id?: string
          line?: Json
          owner_id?: string
          proposal?: Json
          review_group?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_rows_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      import_rules: {
        Row: {
          account_id: string | null
          conditions: Json
          created_at: string
          enabled: boolean
          id: string
          mappings: Json
          merchant: string
          owner_id: string
          priority: number
        }
        Insert: {
          account_id?: string | null
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          mappings?: Json
          merchant: string
          owner_id?: string
          priority?: number
        }
        Update: {
          account_id?: string | null
          conditions?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          mappings?: Json
          merchant?: string
          owner_id?: string
          priority?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      job_state: {
        Row: {
          detail: Json
          last_run: string | null
          last_success: string | null
          lease_until: string
          name: string
          reason: string | null
          status: string
        }
        Insert: {
          detail?: Json
          last_run?: string | null
          last_success?: string | null
          lease_until?: string
          name: string
          reason?: string | null
          status?: string
        }
        Update: {
          detail?: Json
          last_run?: string | null
          last_success?: string | null
          lease_until?: string
          name?: string
          reason?: string | null
          status?: string
        }
        Relationships: []
      }
      loans: {
        Row: {
          account_id: string | null
          annual_rate: number
          created_at: string
          emi: number
          foreclosure_pct: number
          id: string
          loan_type: string
          name: string
          next_due: string
          original_principal: number | null
          owner_id: string
          payments: Json
          prepayment_terms: string
          principal_outstanding: number
          provider: string
          source_transaction_id: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          account_id?: string | null
          annual_rate: number
          created_at?: string
          emi: number
          foreclosure_pct?: number
          id?: string
          loan_type?: string
          name: string
          next_due: string
          original_principal?: number | null
          owner_id: string
          payments?: Json
          prepayment_terms?: string
          principal_outstanding: number
          provider?: string
          source_transaction_id?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          account_id?: string | null
          annual_rate?: number
          created_at?: string
          emi?: number
          foreclosure_pct?: number
          id?: string
          loan_type?: string
          name?: string
          next_due?: string
          original_principal?: number | null
          owner_id?: string
          payments?: Json
          prepayment_terms?: string
          principal_outstanding?: number
          provider?: string
          source_transaction_id?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loans_source_transaction_id_fkey"
            columns: ["source_transaction_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      market_quotes: {
        Row: {
          close: number
          exchange: string
          fetched_at: string
          isin: string | null
          name: string
          prev_close: number | null
          price_date: string
          series: string
          source: string
          symbol: string
        }
        Insert: {
          close: number
          exchange: string
          fetched_at?: string
          isin?: string | null
          name?: string
          prev_close?: number | null
          price_date: string
          series?: string
          source: string
          symbol: string
        }
        Update: {
          close?: number
          exchange?: string
          fetched_at?: string
          isin?: string | null
          name?: string
          prev_close?: number | null
          price_date?: string
          series?: string
          source?: string
          symbol?: string
        }
        Relationships: []
      }
      monthly_reviews: {
        Row: {
          data_cutoff: string
          data_hash: string
          figures: Json
          generated_at: string
          id: string
          month: string
          narrative: string
          owner_id: string
        }
        Insert: {
          data_cutoff: string
          data_hash: string
          figures: Json
          generated_at?: string
          id?: string
          month: string
          narrative?: string
          owner_id?: string
        }
        Update: {
          data_cutoff?: string
          data_hash?: string
          figures?: Json
          generated_at?: string
          id?: string
          month?: string
          narrative?: string
          owner_id?: string
        }
        Relationships: []
      }
      passkey_challenges: {
        Row: {
          challenge: string
          expires_at: string
          kind: string
          origin: string
          owner_id: string
        }
        Insert: {
          challenge: string
          expires_at: string
          kind: string
          origin: string
          owner_id: string
        }
        Update: {
          challenge?: string
          expires_at?: string
          kind?: string
          origin?: string
          owner_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          department: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          department?: string
          full_name?: string
          id: string
        }
        Update: {
          created_at?: string
          department?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      push_reminder_log: {
        Row: {
          created_at: string
          item_key: string
          owner_id: string
          sent_on: string
        }
        Insert: {
          created_at?: string
          item_key: string
          owner_id: string
          sent_on: string
        }
        Update: {
          created_at?: string
          item_key?: string
          owner_id?: string
          sent_on?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_sent_at: string | null
          owner_id: string
          p256dh: string
          user_agent: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_sent_at?: string | null
          owner_id: string
          p256dh: string
          user_agent?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_sent_at?: string | null
          owner_id?: string
          p256dh?: string
          user_agent?: string
        }
        Relationships: []
      }
      receipt_problem_reports: {
        Row: {
          created_at: string
          emailed: boolean
          facts: Json
          id: string
          kind: string
          note: string
          owner_id: string
          receipt_name: string
          receipt_type: string
        }
        Insert: {
          created_at?: string
          emailed?: boolean
          facts?: Json
          id?: string
          kind: string
          note?: string
          owner_id: string
          receipt_name?: string
          receipt_type?: string
        }
        Update: {
          created_at?: string
          emailed?: boolean
          facts?: Json
          id?: string
          kind?: string
          note?: string
          owner_id?: string
          receipt_name?: string
          receipt_type?: string
        }
        Relationships: []
      }
      regulatory_changes: {
        Row: {
          detected_at: string
          fingerprint: string
          id: string
          previous_fingerprint: string | null
          proposals: Json
          source_id: string
          summary: string
          url: string
        }
        Insert: {
          detected_at?: string
          fingerprint: string
          id?: string
          previous_fingerprint?: string | null
          proposals?: Json
          source_id: string
          summary?: string
          url: string
        }
        Update: {
          detected_at?: string
          fingerprint?: string
          id?: string
          previous_fingerprint?: string | null
          proposals?: Json
          source_id?: string
          summary?: string
          url?: string
        }
        Relationships: []
      }
      regulatory_snapshots: {
        Row: {
          excerpt: string
          fetched_at: string
          fingerprint: string
          source_id: string
          url: string
        }
        Insert: {
          excerpt?: string
          fetched_at?: string
          fingerprint: string
          source_id: string
          url: string
        }
        Update: {
          excerpt?: string
          fetched_at?: string
          fingerprint?: string
          source_id?: string
          url?: string
        }
        Relationships: []
      }
      reimbursement_config_audit: {
        Row: {
          action: string
          changed_sections: Json
          created_at: string
          id: string
          owner_id: string
        }
        Insert: {
          action: string
          changed_sections?: Json
          created_at?: string
          id?: string
          owner_id: string
        }
        Update: {
          action?: string
          changed_sections?: Json
          created_at?: string
          id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reimbursement_config_audit_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "finance_preferences"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      report_history: {
        Row: {
          created_at: string
          file_path: string | null
          file_size: number | null
          filters: Json
          id: string
          kind: string
          owner_id: string
          period_from: string | null
          period_to: string | null
          status: string
          title: string
          version: number
          workspace: string
        }
        Insert: {
          created_at?: string
          file_path?: string | null
          file_size?: number | null
          filters?: Json
          id?: string
          kind: string
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          status?: string
          title: string
          version?: number
          workspace?: string
        }
        Update: {
          created_at?: string
          file_path?: string | null
          file_size?: number | null
          filters?: Json
          id?: string
          kind?: string
          owner_id?: string
          period_from?: string | null
          period_to?: string | null
          status?: string
          title?: string
          version?: number
          workspace?: string
        }
        Relationships: []
      }
      report_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          filters: Json
          id: string
          kind: string
          lease_until: string
          owner_id: string
          status: string
          style: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          filters?: Json
          id: string
          kind: string
          lease_until?: string
          owner_id: string
          status?: string
          style?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          filters?: Json
          id?: string
          kind?: string
          lease_until?: string
          owner_id?: string
          status?: string
          style?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_holdings: {
        Row: {
          as_of: string | null
          demat_id: string
          gains: Json
          id: string
          isin: string
          lots: Json
          name: string
          owner_id: string
          quantity: number
          sources: Json
          statement_value: number | null
          updated_at: string
        }
        Insert: {
          as_of?: string | null
          demat_id: string
          gains?: Json
          id?: string
          isin: string
          lots?: Json
          name?: string
          owner_id?: string
          quantity?: number
          sources?: Json
          statement_value?: number | null
          updated_at?: string
        }
        Update: {
          as_of?: string | null
          demat_id?: string
          gains?: Json
          id?: string
          isin?: string
          lots?: Json
          name?: string
          owner_id?: string
          quantity?: number
          sources?: Json
          statement_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_holdings_demat_id_fkey"
            columns: ["demat_id"]
            isOneToOne: false
            referencedRelation: "demat_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      statement_checkpoints: {
        Row: {
          batch_id: string
          created_at: string
          evidence_hash: string
          id: string
          owner_id: string
          result: Json
        }
        Insert: {
          batch_id: string
          created_at?: string
          evidence_hash: string
          id: string
          owner_id: string
          result: Json
        }
        Update: {
          batch_id?: string
          created_at?: string
          evidence_hash?: string
          id?: string
          owner_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "statement_checkpoints_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "import_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "statement_checkpoints_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "finance_preferences"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      statement_line_imports: {
        Row: {
          account_key: string
          batch_id: string
          created_at: string
          file_label: string
          fingerprint: string
          id: string
          line_date: string
          owner_id: string
        }
        Insert: {
          account_key: string
          batch_id: string
          created_at?: string
          file_label?: string
          fingerprint: string
          id?: string
          line_date: string
          owner_id?: string
        }
        Update: {
          account_key?: string
          batch_id?: string
          created_at?: string
          file_label?: string
          fingerprint?: string
          id?: string
          line_date?: string
          owner_id?: string
        }
        Relationships: []
      }
      transaction_audit: {
        Row: {
          action: string
          changes: Json
          created_at: string
          id: string
          owner_id: string
          summary: string
          transaction_id: string
        }
        Insert: {
          action: string
          changes?: Json
          created_at?: string
          id?: string
          owner_id: string
          summary?: string
          transaction_id: string
        }
        Update: {
          action?: string
          changes?: Json
          created_at?: string
          id?: string
          owner_id?: string
          summary?: string
          transaction_id?: string
        }
        Relationships: []
      }
      transfer_links: {
        Row: {
          before: Json
          cancelled_at: string | null
          created_at: string
          credit_id: string | null
          debit_id: string
          dest_account: string
          dest_amount: number | null
          dest_currency: string | null
          id: string
          owner_id: string
          source_account: string
          source_amount: number
          source_currency: string
          status: string
          updated_at: string
        }
        Insert: {
          before?: Json
          cancelled_at?: string | null
          created_at?: string
          credit_id?: string | null
          debit_id: string
          dest_account: string
          dest_amount?: number | null
          dest_currency?: string | null
          id: string
          owner_id: string
          source_account: string
          source_amount: number
          source_currency: string
          status?: string
          updated_at?: string
        }
        Update: {
          before?: Json
          cancelled_at?: string | null
          created_at?: string
          credit_id?: string | null
          debit_id?: string
          dest_account?: string
          dest_amount?: number | null
          dest_currency?: string | null
          id?: string
          owner_id?: string
          source_account?: string
          source_amount?: number
          source_currency?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      upload_link_events: {
        Row: {
          at: string
          detail: string | null
          id: string
          kind: string
          link_id: string
          owner_id: string
        }
        Insert: {
          at?: string
          detail?: string | null
          id?: string
          kind: string
          link_id: string
          owner_id: string
        }
        Update: {
          at?: string
          detail?: string | null
          id?: string
          kind?: string
          link_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_link_events_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "upload_links"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_links: {
        Row: {
          created_at: string
          expires_at: string
          file_count: number
          id: string
          last_emailed_at: string | null
          max_files: number
          owner_id: string
          revoked_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          file_count?: number
          id?: string
          last_emailed_at?: string | null
          max_files?: number
          owner_id: string
          revoked_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          file_count?: number
          id?: string
          last_emailed_at?: string | null
          max_files?: number
          owner_id?: string
          revoked_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      accept_family_invite: { Args: { _invite: string }; Returns: undefined }
      apply_review_metadata: {
        Args: { _config: Json; _id: string; _items: Json }
        Returns: string
      }
      bulk_category_change: {
        Args: { batch_id: string; items: Json; target: string }
        Returns: string
      }
      cancel_transfer: { Args: { _id: string }; Returns: undefined }
      claim_import_ai: { Args: { _owner: string }; Returns: boolean }
      claim_import_batches: {
        Args: never
        Returns: {
          account_id: string
          allow_ai: boolean
          attempts: number
          balance_verification: Json
          closing_balance: number | null
          created_at: string
          currency: string
          error: string | null
          file_hash: string
          file_name: string
          file_path: string
          id: string
          lease_until: string
          next_page: number
          opening_balance: number | null
          owner_id: string
          period_from: string | null
          period_to: string | null
          raw_lines: Json
          source_balances: Json
          statement_identity: Json
          statement_review: Json
          status: string
          total_pages: number | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "import_batches"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_job: { Args: { _minutes: number; _name: string }; Returns: boolean }
      claim_report_jobs: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          created_at: string
          error: string | null
          filters: Json
          id: string
          kind: string
          lease_until: string
          owner_id: string
          status: string
          style: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "report_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_upload_slot: { Args: { _link: string }; Returns: string }
      commit_document_intake: {
        Args: { p_data: Json; p_document_id: string; p_lock: boolean }
        Returns: undefined
      }
      confirm_transfer: {
        Args: {
          _credit: string
          _credit_rev: number
          _debit: string
          _debit_rev: number
          _dest: string
          _id: string
        }
        Returns: string
      }
      correct_financial_entries: {
        Args: { _accounts: Json; _choice: Json; _id: string; _items: Json }
        Returns: string
      }
      decide_family_request: {
        Args: { _id: string; _note: string; _status: string }
        Returns: undefined
      }
      delete_my_finance_data: { Args: never; Returns: undefined }
      expired_demo_owners: { Args: never; Returns: string[] }
      family_invite_owner: { Args: { _invite: string }; Returns: string }
      finance_operation: {
        Args: { action: string; payload: Json }
        Returns: Json
      }
      finish_my_report_job: { Args: { _id: string }; Returns: undefined }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      link_activity_expenses: {
        Args: { _items: Json; _tag: string }
        Returns: number
      }
      manage_trip_expenses: {
        Args: { _action: string; _items: Json; _trip: string; _value?: string }
        Returns: number
      }
      move_expense_category: {
        Args: { source: string; target: string }
        Returns: undefined
      }
      my_department: { Args: never; Returns: string }
      my_family_invites: {
        Args: never
        Returns: {
          accepted: boolean
          id: string
          inviter_email: string
          member_name: string
          revoked: boolean
        }[]
      }
      post_import_rows: {
        Args: { _batch: string; _rows: Json }
        Returns: number
      }
      post_import_rows_secure: {
        Args: { _batch: string; _owner: string; _rows: Json }
        Returns: number
      }
      receive_claim_receipt: {
        Args: {
          expense_id: string
          receipt_account: string
          receipt_amount: number
          receipt_date: string
          receipt_note?: string
        }
        Returns: Json
      }
      reconcile_expense: {
        Args: { _expense_id: string; _statement_ref: string }
        Returns: undefined
      }
      record_statement_checkpoint: {
        Args: {
          _batch: string
          _expected: Json
          _hash: string
          _id: string
          _ledger: Json
          _owner: string
          _posts: Json
          _result: Json
          _rows: Json
        }
        Returns: undefined
      }
      restore_finance_backup: {
        Args: { display_name?: string; payload: Json }
        Returns: Json
      }
      retry_my_report_job: { Args: { _id: string }; Returns: undefined }
      review_expense: {
        Args: { _decision: string; _expense_id: string; _note?: string }
        Returns: string
      }
      review_statement_evidence: {
        Args: { _batch: string; _expected: Json; _review: Json }
        Returns: undefined
      }
      revise_import_rows: {
        Args: { _batch: string; _decision?: string; _items: Json; _patch: Json }
        Returns: number
      }
      save_claim_preparation: {
        Args: { _data: Json; _expected: number; _id: string; _mutation: string }
        Returns: {
          created_at: string
          data: Json
          id: string
          mutation_id: string
          owner_id: string
          revision: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "claim_preparations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_import_balance_review: {
        Args: {
          _batch: string
          _closing: number
          _from: string
          _opening: number
          _review: Json
          _to: string
        }
        Returns: undefined
      }
      start_demo_workspace: { Args: { _label: string }; Returns: undefined }
      undo_category_change: { Args: { batch_id: string }; Returns: undefined }
      undo_financial_correction: { Args: { _id: string }; Returns: undefined }
      undo_review_metadata: { Args: { _id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "employee" | "manager" | "finance"
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
      app_role: ["employee", "manager", "finance"],
    },
  },
} as const
