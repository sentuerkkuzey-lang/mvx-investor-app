export type Role = "owner" | "investor";

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  shares: number;
  first_login: boolean;
  created_at: string;
}

export type PollStatus = "open" | "closed";
export type PollUrgency = "normal" | "urgent" | "emergency";

export interface Poll {
  id: string;
  question: string;
  description: string | null;
  status: PollStatus;
  urgency: PollUrgency;
  closes_at: string | null;
  created_at: string;
  created_by: string;
}

export interface PollOption {
  id: string;
  poll_id: string;
  label: string;
  position: number;
}

export interface PollOptionResult {
  option_id: string;
  label: string;
  position: number;
  vote_count: number;
}

export interface NewsPost {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  created_by: string;
  created_at: string;
}

export interface DocumentFile {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  file_name: string;
  file_size: number | null;
  uploaded_by: string;
  created_at: string;
}

export interface ActivityLogEntry {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_label: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
}
