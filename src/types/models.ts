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
