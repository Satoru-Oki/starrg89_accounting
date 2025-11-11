import React, { createContext, useState, useContext, useEffect } from 'react';
import { User, AuthContextType } from '../types';
import api from '../services/api';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// 開発モード: バックエンドが未設定の場合はモック認証を使用
const USE_MOCK_AUTH = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in (token exists)
    const token = localStorage.getItem('token');
    if (token) {
      if (USE_MOCK_AUTH) {
        // モック認証: ローカルストレージからユーザー情報を取得
        const mockUser = localStorage.getItem('mockUser');
        if (mockUser) {
          setUser(JSON.parse(mockUser));
          setIsAuthenticated(true);
        }
        setLoading(false);
      } else {
        // Validate token and get user info
        api.get('/auth/validate')
          .then((response) => {
            setUser(response.data.user);
            setIsAuthenticated(true);
          })
          .catch(() => {
            localStorage.removeItem('token');
          })
          .finally(() => {
            setLoading(false);
          });
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (userId: string, password: string) => {
    if (USE_MOCK_AUTH) {
      // モック認証: どんなユーザーID/パスワードでもログイン可能
      // "admin"でログインすると管理者権限
      const mockUser: User = {
        id: userId === 'admin' ? 1 : 2,
        email: userId + '@example.com',
        name: userId,
        role: userId === 'admin' ? 'admin' : 'user',
      };
      localStorage.setItem('token', 'mock-token-' + Date.now());
      localStorage.setItem('mockUser', JSON.stringify(mockUser));
      setUser(mockUser);
      setIsAuthenticated(true);
      return;
    }

    try {
      const response = await api.post('/auth/login', { userId, password });
      const { token, user } = response.data;
      localStorage.setItem('token', token);
      setUser(user);
      setIsAuthenticated(true);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('mockUser');
    setUser(null);
    setIsAuthenticated(false);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
