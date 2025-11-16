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
  payee?: string;
  balance?: number;
  user_id?: number;
  user_name?: string;
  receipt_url?: string | null;
  is_pdf?: boolean;
  updated_at?: string;
  created_at?: string;
}

export interface Category {
  id: number;
  name: string;
  type: 'expense' | 'income';
}

export interface PaymentDetail {
  id?: number;
  deposit_date: string;
  sales_amount?: number;
  commission_fee?: number;
  consumption_tax?: number;
  transfer_amount?: number;
  user_id?: number;
  user_name?: string;
  payment_file_url?: string | null;
  is_pdf?: boolean;
  updated_at?: string;
  created_at?: string;
}

export interface AuthContextType {
  user: User | null;
  login: (userId: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}
