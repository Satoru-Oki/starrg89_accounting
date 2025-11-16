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
import PaymentDetailsTable from './PaymentDetailsTable';

type ViewMode = 'receipts' | 'invoices' | 'payment_details';

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

  // スーパー管理者のみ収納明細を表示
  const canViewPaymentDetails = user?.role === 'superadmin';

  useEffect(() => {
    // URLパスに基づいて初期表示モードを設定
    if (location.pathname === '/invoices') {
      setViewMode('invoices');
    } else if (location.pathname === '/payment-details') {
      setViewMode('payment_details');
    } else {
      setViewMode('receipts');
    }
  }, [location.pathname]);

  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    // URLも更新
    if (mode === 'invoices') {
      navigate('/invoices', { replace: true });
    } else if (mode === 'payment_details') {
      navigate('/payment-details', { replace: true });
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
    } else if (viewMode === 'invoices') {
      navigate('/invoice-directory');
    } else if (viewMode === 'payment_details') {
      navigate('/payment-directory');
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
            <>
              <Button
                variant="contained"
                onClick={() => handleViewChange('receipts')}
                sx={{
                  mr: 1,
                  bgcolor: viewMode === 'receipts' ? '#4caf50' : '#e0e0e0',
                  color: viewMode === 'receipts' ? 'white' : '#000',
                  '&:hover': {
                    bgcolor: viewMode === 'receipts' ? '#45a049' : '#d0d0d0',
                  },
                }}
              >
                領収書
              </Button>
              <Button
                variant="contained"
                onClick={() => handleViewChange('invoices')}
                sx={{
                  mr: canViewPaymentDetails ? 1 : 2,
                  bgcolor: viewMode === 'invoices' ? '#ffd54f' : '#e0e0e0',
                  color: viewMode === 'invoices' ? '#000' : '#000',
                  '&:hover': {
                    bgcolor: viewMode === 'invoices' ? '#ffc107' : '#d0d0d0',
                  },
                }}
              >
                請求書
              </Button>
            </>
          )}
          {canViewPaymentDetails && (
            <Button
              variant="contained"
              onClick={() => handleViewChange('payment_details')}
              sx={{
                mr: 2,
                bgcolor: viewMode === 'payment_details' ? '#9c27b0' : '#e0e0e0',
                color: viewMode === 'payment_details' ? 'white' : '#000',
                '&:hover': {
                  bgcolor: viewMode === 'payment_details' ? '#7b1fa2' : '#d0d0d0',
                },
              }}
            >
              収納明細
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
              {viewMode === 'receipts' ? 'レシートディレクトリ' : viewMode === 'invoices' ? '請求書ディレクトリ' : '収納明細ディレクトリ'}
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
      {viewMode === 'receipts' && <TransactionTable hideAppBar />}
      {viewMode === 'invoices' && <InvoiceTable hideAppBar />}
      {viewMode === 'payment_details' && <PaymentDetailsTable hideAppBar />}
    </Box>
  );
};

export default MainTable;
