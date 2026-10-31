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
      documents: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string
          currency: string
          doc_date: string | null
          doc_type: string
          expires_on: string | null
          extracted_text: string
          file_name: string
          file_path: string
          id: string
          loan_id: string | null
          merchant: string | null
          mime_type: string
          notes: string
          owner_id: string
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
          expires_on?: string | null
          extracted_text?: string
          file_name: string
          file_path: string
          id?: string
          loan_id?: string | null
          merchant?: string | null
          mime_type?: string
          notes?: string
          owner_id: string
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
          expires_on?: string | null
          extracted_text?: string
          file_name?: string
          file_path?: string
          id?: string
          loan_id?: string | null
          merchant?: string | null
          mime_type?: string
          notes?: string
          owner_id?: string
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
      bulk_category_change: {
        Args: { batch_id: string; items: Json; target: string }
        Returns: string
      }
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
      decide_family_request: {
        Args: { _id: string; _note: string; _status: string }
        Returns: undefined
      }
      delete_my_finance_data: { Args: never; Returns: undefined }
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
      restore_finance_backup: {
        Args: { display_name?: string; payload: Json }
        Returns: Json
      }
      retry_my_report_job: { Args: { _id: string }; Returns: undefined }
      review_expense: {
        Args: { _decision: string; _expense_id: string; _note?: string }
        Returns: string
      }
      undo_category_change: { Args: { batch_id: string }; Returns: undefined }
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
