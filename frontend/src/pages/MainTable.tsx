import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import FolderIcon from '@mui/icons-material/Folder';
import { useAuth } from '../contexts/AuthContext';
import TransactionTable from './TransactionTable';
import InvoiceTable from './InvoiceTable';

type ViewMode = 'receipts' | 'invoices';

const MainTable = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [viewMode, setViewMode] = useState<ViewMode>('receipts');

  // 特定のユーザーのみトグルを表示
  const canToggle = user?.role === 'superadmin' ||
                     user?.role === 'admin' ||
                     user?.user_id === 'kanae' ||
                     user?.user_id === 'risa' ||
                     user?.user_id === 'oki';

  useEffect(() => {
    // URLパスに基づいて初期表示モードを設定
    if (location.pathname === '/invoices') {
      setViewMode('invoices');
    } else {
      setViewMode('receipts');
    }
  }, [location.pathname]);

  const handleViewChange = () => {
    const newView = viewMode === 'receipts' ? 'invoices' : 'receipts';
    setViewMode(newView);
    // URLも更新
    if (newView === 'invoices') {
      navigate('/invoices', { replace: true });
    } else {
      navigate('/transactions', { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDirectoryClick = () => {
    if (viewMode === 'receipts') {
      navigate('/receipts');
    } else {
      navigate('/invoice-directory');
    }
  };

  return (
    <Box>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant={isMobile ? 'body1' : 'h6'}
            component="div"
            sx={{
              flexGrow: 0,
              mr: 2,
              fontWeight: 'bold',
            }}
          >
            Star R.G 89 経理清算システム
          </Typography>
          {canToggle && (
            <Button
              variant="contained"
              onClick={handleViewChange}
              sx={{
                mr: 2,
                bgcolor: viewMode === 'receipts' ? '#4caf50' : '#ffd54f',
                color: viewMode === 'receipts' ? 'white' : '#000',
                '&:hover': {
                  bgcolor: viewMode === 'receipts' ? '#45a049' : '#ffc107',
                },
              }}
            >
              {viewMode === 'receipts' ? '領収書' : '請求書'}
            </Button>
          )}
          {(user?.role === 'superadmin') && (
            <Button
              variant="outlined"
              startIcon={<FolderIcon />}
              onClick={handleDirectoryClick}
              sx={{
                mr: 2,
                color: 'white',
                borderColor: 'white',
                '&:hover': {
                  borderColor: 'white',
                  bgcolor: 'rgba(255, 255, 255, 0.1)',
                },
              }}
            >
              {viewMode === 'receipts' ? 'レシートディレクトリ' : '請求書ディレクトリ'}
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {!isMobile && viewMode === 'receipts' && (
            <Typography
              variant="body2"
              sx={{
                color: 'white',
                fontSize: '0.85rem',
                mr: 3,
              }}
            >
              ※ 領収書は登録番号（Tからはじまる13桁）の記載があるものを添付してください
            </Typography>
          )}
          {!isMobile && (
            <Typography variant="body1" sx={{ mr: 2 }}>
              {user?.name} さん
            </Typography>
          )}
          <IconButton color="inherit" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      {viewMode === 'receipts' ? <TransactionTable hideAppBar /> : <InvoiceTable hideAppBar />}
    </Box>
  );
};

export default MainTable;
