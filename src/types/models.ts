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
