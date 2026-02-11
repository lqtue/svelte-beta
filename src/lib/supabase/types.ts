export interface Database {
  public: {
    Tables: {
      maps: {
        Row: {
          id: string;
          allmaps_id: string;
          name: string;
          type: string | null;
          summary: string | null;
          description: string | null;
          thumbnail: string | null;
          is_featured: boolean;
          year: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          allmaps_id: string;
          name: string;
          type?: string | null;
          summary?: string | null;
          description?: string | null;
          thumbnail?: string | null;
          is_featured?: boolean;
          year?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          allmaps_id?: string;
          name?: string;
          type?: string | null;
          summary?: string | null;
          description?: string | null;
          thumbnail?: string | null;
          is_featured?: boolean;
          year?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          role: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          role?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          role?: string;
          display_name?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      hunts: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          region: { center: [number, number]; zoom: number } | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          region?: { center: [number, number]; zoom: number } | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          region?: { center: [number, number]; zoom: number } | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'hunts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      hunt_stops: {
        Row: {
          id: string;
          hunt_id: string;
          sort_order: number;
          title: string;
          description: string | null;
          hint: string | null;
          quest: string | null;
          lon: number;
          lat: number;
          trigger_radius: number;
          interaction: string;
          qr_payload: string | null;
          overlay_map_id: string | null;
        };
        Insert: {
          id?: string;
          hunt_id: string;
          sort_order: number;
          title: string;
          description?: string | null;
          hint?: string | null;
          quest?: string | null;
          lon: number;
          lat: number;
          trigger_radius?: number;
          interaction?: string;
          qr_payload?: string | null;
          overlay_map_id?: string | null;
        };
        Update: {
          id?: string;
          hunt_id?: string;
          sort_order?: number;
          title?: string;
          description?: string | null;
          hint?: string | null;
          quest?: string | null;
          lon?: number;
          lat?: number;
          trigger_radius?: number;
          interaction?: string;
          qr_payload?: string | null;
          overlay_map_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'hunt_stops_hunt_id_fkey';
            columns: ['hunt_id'];
            isOneToOne: false;
            referencedRelation: 'hunts';
            referencedColumns: ['id'];
          }
        ];
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          map_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          map_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          map_id?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          }
        ];
      };
      georef_submissions: {
        Row: {
          id: string;
          iiif_url: string;
          name: string;
          description: string | null;
          status: 'open' | 'in_progress' | 'review_needed' | 'approved' | 'rejected';
          submitted_by: string | null;
          allmaps_id: string | null;
          admin_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          iiif_url: string;
          name: string;
          description?: string | null;
          status?: 'open' | 'in_progress' | 'review_needed' | 'approved' | 'rejected';
          submitted_by?: string | null;
          allmaps_id?: string | null;
          admin_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          iiif_url?: string;
          name?: string;
          description?: string | null;
          status?: 'open' | 'in_progress' | 'review_needed' | 'approved' | 'rejected';
          submitted_by?: string | null;
          allmaps_id?: string | null;
          admin_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      hunt_progress: {
        Row: {
          id: string;
          user_id: string;
          hunt_id: string;
          current_stop_index: number;
          completed_stops: string[];
          started_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          hunt_id: string;
          current_stop_index?: number;
          completed_stops?: string[];
          started_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          hunt_id?: string;
          current_stop_index?: number;
          completed_stops?: string[];
          started_at?: string;
          completed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'hunt_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'hunt_progress_hunt_id_fkey';
            columns: ['hunt_id'];
            isOneToOne: false;
            referencedRelation: 'hunts';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
