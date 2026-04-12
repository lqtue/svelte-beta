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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      annotation_sets: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_public: boolean
          map_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          is_public?: boolean
          map_id?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_public?: boolean
          map_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "annotation_sets_map_id_fk"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      footprint_submissions: {
        Row: {
          category: string | null
          confidence: number | null
          created_at: string | null
          feature_type: string
          id: string
          iiif_canvas: string | null
          map_id: string | null
          name: string | null
          pixel_polygon: Json
          source: string
          status: string
          temporal_status: string
          updated_at: string | null
          user_id: string | null
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          feature_type?: string
          id?: string
          iiif_canvas?: string | null
          map_id?: string | null
          name?: string | null
          pixel_polygon: Json
          source?: string
          status?: string
          temporal_status?: string
          updated_at?: string | null
          user_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          category?: string | null
          confidence?: number | null
          created_at?: string | null
          feature_type?: string
          id?: string
          iiif_canvas?: string | null
          map_id?: string | null
          name?: string | null
          pixel_polygon?: Json
          source?: string
          status?: string
          temporal_status?: string
          updated_at?: string | null
          user_id?: string | null
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "footprint_submissions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      label_pins: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          label: string
          map_id: string
          pixel_x: number
          pixel_y: number
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          label: string
          map_id: string
          pixel_x: number
          pixel_y: number
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          label?: string
          map_id?: string
          pixel_x?: number
          pixel_y?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "label_pins_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      legend_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string
          entries: Json
          id: string
          is_canonical: boolean
          legend_type: string
          map_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          entries?: Json
          id?: string
          is_canonical?: boolean
          legend_type?: string
          map_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          entries?: Json
          id?: string
          is_canonical?: boolean
          legend_type?: string
          map_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "legend_submissions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      map_help_requests: {
        Row: {
          created_at: string
          help_type: string
          id: string
          map_id: string
          message: string
          mod_response: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          help_type?: string
          id?: string
          map_id: string
          message: string
          mod_response?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          help_type?: string
          id?: string
          map_id?: string
          message?: string
          mod_response?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_help_requests_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      map_iiif_sources: {
        Row: {
          created_at: string | null
          id: string
          iiif_image: string
          iiif_manifest: string | null
          is_primary: boolean
          label: string | null
          map_id: string
          sort_order: number
          source_type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          iiif_image: string
          iiif_manifest?: string | null
          is_primary?: boolean
          label?: string | null
          map_id: string
          sort_order?: number
          source_type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          iiif_image?: string
          iiif_manifest?: string | null
          is_primary?: boolean
          label?: string | null
          map_id?: string
          sort_order?: number
          source_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "map_iiif_sources_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          allmaps_id: string | null
          bbox: number[] | null
          collection: string | null
          created_at: string | null
          created_by: string | null
          creator: string | null
          dc_coverage: string | null
          dc_description: string | null
          dc_publisher: string | null
          dc_subject: string | null
          extra_metadata: Json | null
          georef_done: boolean
          help_needed: boolean
          ia_identifier: string | null
          id: string
          iiif_image: string | null
          iiif_manifest: string | null
          is_featured: boolean | null
          is_public: boolean
          label_config: Json
          language: string | null
          legend_done: boolean
          location: string | null
          map_type: string | null
          name: string
          original_title: string | null
          physical_description: string | null
          priority: number
          rights: string | null
          shelfmark: string | null
          source_type: string | null
          source_url: string | null
          status: string | null
          thumbnail: string | null
          updated_at: string | null
          year: number | null
          year_label: string | null
        }
        Insert: {
          allmaps_id?: string | null
          bbox?: number[] | null
          collection?: string | null
          created_at?: string | null
          created_by?: string | null
          creator?: string | null
          dc_coverage?: string | null
          dc_description?: string | null
          dc_publisher?: string | null
          dc_subject?: string | null
          extra_metadata?: Json | null
          georef_done?: boolean
          help_needed?: boolean
          ia_identifier?: string | null
          id?: string
          iiif_image?: string | null
          iiif_manifest?: string | null
          is_featured?: boolean | null
          is_public?: boolean
          label_config?: Json
          language?: string | null
          legend_done?: boolean
          location?: string | null
          map_type?: string | null
          name: string
          original_title?: string | null
          physical_description?: string | null
          priority?: number
          rights?: string | null
          shelfmark?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          updated_at?: string | null
          year?: number | null
          year_label?: string | null
        }
        Update: {
          allmaps_id?: string | null
          bbox?: number[] | null
          collection?: string | null
          created_at?: string | null
          created_by?: string | null
          creator?: string | null
          dc_coverage?: string | null
          dc_description?: string | null
          dc_publisher?: string | null
          dc_subject?: string | null
          extra_metadata?: Json | null
          georef_done?: boolean
          help_needed?: boolean
          ia_identifier?: string | null
          id?: string
          iiif_image?: string | null
          iiif_manifest?: string | null
          is_featured?: boolean | null
          is_public?: boolean
          label_config?: Json
          language?: string | null
          legend_done?: boolean
          location?: string | null
          map_type?: string | null
          name?: string
          original_title?: string | null
          physical_description?: string | null
          priority?: number
          rights?: string | null
          shelfmark?: string | null
          source_type?: string | null
          source_url?: string | null
          status?: string | null
          thumbnail?: string | null
          updated_at?: string | null
          year?: number | null
          year_label?: string | null
        }
        Relationships: []
      }
      metadata_submissions: {
        Row: {
          admin_notes: string | null
          created_at: string
          fields: Json
          id: string
          is_canonical: boolean
          map_id: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_canonical?: boolean
          map_id: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          fields?: Json
          id?: string
          is_canonical?: boolean
          map_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metadata_submissions_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          display_name: string | null
          id: string
          role: string | null
        }
        Insert: {
          created_at?: string | null
          display_name?: string | null
          id: string
          role?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string | null
          id?: string
          role?: string | null
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string | null
          id: string
          map_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          map_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          map_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_favorites_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      canonicalise_category: { Args: { raw: string }; Returns: string }
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
