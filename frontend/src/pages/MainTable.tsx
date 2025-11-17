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
  CircularProgress,
  Backdrop,
} from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import FolderIcon from '@mui/icons-material/Folder';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { useAuth } from '../contexts/AuthContext';
import TransactionTable from './TransactionTable';
import InvoiceTable from './InvoiceTable';
import PaymentDetailsTable from './PaymentDetailsTable';
import ClPaymentTable from './ClPaymentTable';
import { CameraCapture } from '../components/CameraCapture';
import api from '../services/api';

type ViewMode = 'receipts' | 'invoices' | 'cl_payments' | 'payment_details';

const MainTable = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [viewMode, setViewMode] = useState<ViewMode>('receipts');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);

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
    } else if (location.pathname === '/cl-payments') {
      setViewMode('cl_payments');
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
    } else if (mode === 'cl_payments') {
      navigate('/cl-payments', { replace: true });
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
    } else if (viewMode === 'cl_payments') {
      navigate('/cl-payment-directory');
    } else if (viewMode === 'payment_details') {
      navigate('/payment-directory');
    }
  };

  // トグルボタン: 領収書 → 請求書 → CL決済 → 領収書...
  const handleToggleMode = () => {
    if (viewMode === 'receipts') {
      handleViewChange('invoices');
    } else if (viewMode === 'invoices') {
      handleViewChange('cl_payments');
    } else {
      handleViewChange('receipts');
    }
  };

  // カメラで撮影した画像をOCR処理してからテーブルに渡す
  const handleCameraCapture = async (file: File) => {
    setCameraOpen(false);
    setOcrProcessing(true);

    try {
      // OCR処理を実行
      let ocrData: any = {};

      try {
        const formData = new FormData();
        formData.append('receipt', file);

        const response = await api.post('/transactions/extract_receipt_data', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        ocrData = {
          date: response.data.date,
          amount: response.data.amount,
          payee: response.data.payee,
          raw_text: response.data.raw_text,
        };

        console.log('OCR処理成功:', ocrData);
      } catch (ocrError: any) {
        console.warn('OCR処理に失敗しましたが、画像は保存できます:', ocrError);
        ocrData = {};
      }

      // 各テーブルにファイルとOCRデータを渡す
      window.dispatchEvent(new CustomEvent('cameraCapture', {
        detail: {
          file,
          mode: viewMode,
          ocrData
        }
      }));
    } catch (error) {
      console.error('カメラキャプチャ処理エラー:', error);
    } finally {
      setOcrProcessing(false);
    }
  };

  // モード表示名
  const getModeName = () => {
    if (viewMode === 'receipts') return '領収書';
    if (viewMode === 'invoices') return '請求書';
    if (viewMode === 'cl_payments') return 'CL決済';
    return '収納明細';
  };

  // モード色
  const getModeColor = () => {
    if (viewMode === 'receipts') return '#4caf50';
    if (viewMode === 'invoices') return '#ffd54f';
    if (viewMode === 'cl_payments') return '#ff9800';
    return '#9c27b0';
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
              {isMobile ? (
                // モバイル: トグルボタン + カメラボタン
                <>
                  <Button
                    variant="contained"
                    onClick={handleToggleMode}
                    sx={{
                      mr: 1,
                      bgcolor: getModeColor(),
                      color: 'white',
                      fontWeight: 'bold',
                      minWidth: '100px',
                      '&:hover': {
                        bgcolor: getModeColor(),
                        opacity: 0.9,
                      },
                    }}
                  >
                    {getModeName()}
                  </Button>
                  <IconButton
                    color="inherit"
                    onClick={() => setCameraOpen(true)}
                    sx={{
                      mr: 2,
                      bgcolor: 'rgba(255, 255, 255, 0.2)',
                      '&:hover': {
                        bgcolor: 'rgba(255, 255, 255, 0.3)',
                      },
                    }}
                  >
                    <CameraAltIcon />
                  </IconButton>
                </>
              ) : (
                // PC: 個別のボタン
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
                      mr: 1,
                      bgcolor: viewMode === 'invoices' ? '#ffd54f' : '#e0e0e0',
                      color: viewMode === 'invoices' ? '#000' : '#000',
                      '&:hover': {
                        bgcolor: viewMode === 'invoices' ? '#ffc107' : '#d0d0d0',
                      },
                    }}
                  >
                    請求書
                  </Button>
                  <Button
                    variant="contained"
                    onClick={() => handleViewChange('cl_payments')}
                    sx={{
                      mr: canViewPaymentDetails ? 1 : 2,
                      bgcolor: viewMode === 'cl_payments' ? '#ff9800' : '#e0e0e0',
                      color: viewMode === 'cl_payments' ? 'white' : '#000',
                      backgroundImage: viewMode === 'cl_payments' ? 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,.1) 10px, rgba(255,255,255,.1) 20px)' : 'none',
                      '&:hover': {
                        bgcolor: viewMode === 'cl_payments' ? '#f57c00' : '#d0d0d0',
                      },
                    }}
                  >
                    CL決済
                  </Button>
                </>
              )}
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
              {viewMode === 'receipts' ? 'レシートディレクトリ' : viewMode === 'invoices' ? '請求書ディレクトリ' : viewMode === 'cl_payments' ? 'CL決済ディレクトリ' : '収納明細ディレクトリ'}
            </Button>
          )}
          <Box sx={{ flexGrow: 1 }} />
          {!isMobile && viewMode === 'receipts' && user?.role !== 'superadmin' && (
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
      {viewMode === 'cl_payments' && <ClPaymentTable hideAppBar />}
      {viewMode === 'payment_details' && <PaymentDetailsTable hideAppBar />}

      {/* カメラダイアログ（モバイルのみ） */}
      {isMobile && (
        <CameraCapture
          open={cameraOpen}
          onClose={() => setCameraOpen(false)}
          onCapture={handleCameraCapture}
        />
      )}

      {/* OCR処理中のローディング */}
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
        open={ocrProcessing}
      >
        <Box sx={{ textAlign: 'center' }}>
          <CircularProgress color="inherit" />
          <Typography sx={{ mt: 2 }}>
            OCR処理中...
          </Typography>
        </Box>
      </Backdrop>
    </Box>
  );
};

export default MainTable;
