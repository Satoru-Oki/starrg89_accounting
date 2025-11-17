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
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  TextField,
  Alert,
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
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingOcrData, setPendingOcrData] = useState<any>(null);
  const [editableOcrData, setEditableOcrData] = useState<any>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');

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

  // カメラで撮影した画像をOCR処理して確認ダイアログを表示
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

      // プレビューURLを作成
      const fileUrl = URL.createObjectURL(file);
      setPreviewImageUrl(fileUrl);

      // 確認ダイアログ用にデータを保存
      setPendingFile(file);
      setPendingOcrData(ocrData);
      setEditableOcrData(ocrData);
      setConfirmDialogOpen(true);
    } catch (error) {
      console.error('カメラキャプチャ処理エラー:', error);
    } finally {
      setOcrProcessing(false);
    }
  };

  // OCR確認後、各テーブルにファイルとOCRデータを渡して自動保存
  const handleConfirmOcr = () => {
    if (pendingFile) {
      // 各テーブルにファイルとOCRデータを渡す（autoSaveフラグ付き）
      window.dispatchEvent(new CustomEvent('cameraCapture', {
        detail: {
          file: pendingFile,
          mode: viewMode,
          ocrData: editableOcrData,
          autoSave: true // 自動保存フラグ
        }
      }));
    }
    handleCancelOcr();
  };

  // OCR確認をキャンセル
  const handleCancelOcr = () => {
    setConfirmDialogOpen(false);
    setPendingFile(null);
    setPendingOcrData(null);
    setEditableOcrData({});
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
      setPreviewImageUrl('');
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
                      color: viewMode === 'invoices' ? '#000' : 'white',
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

      {/* OCR確認ダイアログ */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelOcr}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {viewMode === 'receipts' ? 'レシート' : viewMode === 'invoices' ? '請求書' : 'CL決済'}画像とOCRデータの確認
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mt: 1 }}>
            {/* 画像プレビュー */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                {viewMode === 'receipts' ? 'レシート' : viewMode === 'invoices' ? '請求書' : 'CL決済'}画像
              </Typography>
              {previewImageUrl && (
                <Box
                  component="img"
                  src={previewImageUrl}
                  alt="プレビュー"
                  sx={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '500px',
                    objectFit: 'contain',
                    border: '1px solid #ddd',
                    borderRadius: 1,
                  }}
                />
              )}
            </Box>

            {/* OCRデータ（編集可能） */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                OCRで読み取ったデータ（編集可能）
              </Typography>
              <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <TextField
                  fullWidth
                  label="日付"
                  type="date"
                  value={editableOcrData?.date || ''}
                  onChange={(e) => setEditableOcrData({ ...editableOcrData, date: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  sx={{ mb: 2 }}
                  size="small"
                  helperText={!pendingOcrData?.date ? '読み取れませんでした' : ''}
                />
                <TextField
                  fullWidth
                  label="金額"
                  type="number"
                  value={editableOcrData?.amount || ''}
                  onChange={(e) => setEditableOcrData({ ...editableOcrData, amount: Number(e.target.value) })}
                  sx={{ mb: 2 }}
                  size="small"
                  helperText={!pendingOcrData?.amount ? '読み取れませんでした' : ''}
                  InputProps={{
                    startAdornment: <Typography sx={{ mr: 1 }}>¥</Typography>,
                  }}
                />
                <TextField
                  fullWidth
                  label={viewMode === 'receipts' ? '支払先' : viewMode === 'invoices' ? '請求元' : '注文先'}
                  value={editableOcrData?.payee || ''}
                  onChange={(e) => setEditableOcrData({ ...editableOcrData, payee: e.target.value })}
                  sx={{ mb: 2 }}
                  size="small"
                  helperText={!pendingOcrData?.payee ? '読み取れませんでした' : ''}
                />
                {pendingOcrData?.date || pendingOcrData?.amount || pendingOcrData?.payee ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    読み取れなかった項目や間違っている項目を修正できます。
                  </Alert>
                ) : (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    OCR処理に失敗しました。手動でデータを入力してください。
                  </Alert>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelOcr} color="inherit">
            キャンセル
          </Button>
          <Button onClick={handleConfirmOcr} variant="contained" color="primary">
            このデータで登録
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default MainTable;
