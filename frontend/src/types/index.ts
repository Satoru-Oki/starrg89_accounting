export interface User {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'user';
}

export interface Transaction {
  id?: number;
  date: string;
  deposit_from_star?: number;
  payment?: number;
  category: string;
  description: string;
  receipt_status?: string;
  balance?: number;
  user_id?: number;
  user_name?: string;
  updated_at?: string;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'expense' | 'income';
}

export interface AuthContextType {
  user: User | null;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}
