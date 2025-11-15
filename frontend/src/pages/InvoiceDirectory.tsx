import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  AppBar,
  Toolbar,
  IconButton,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Card,
  CardMedia,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import FolderIcon from '@mui/icons-material/Folder';
import LogoutIcon from '@mui/icons-material/Logout';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface ReceiptItem {
  id: number;
  user_id: number;
  user_name: string;
  date: string;
  amount: number | null;
  payee: string | null;
  receipt_url: string;
  is_pdf: boolean;
}

interface InvoiceTree {
  [year: string]: {
    [month: string]: {
      [day: string]: ReceiptItem[];
    };
  };
}

const InvoiceDirectory = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [invoiceTree, setInvoiceTree] = useState<InvoiceTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<ReceiptItem | null>(null);

  useEffect(() => {
    // スーパー管理者以外はリダイレクト
    if (user?.role !== 'superadmin') {
      navigate('/');
      return;
    }

    fetchInvoiceDirectory();
  }, [user, navigate]);

  const fetchInvoiceDirectory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/invoices/invoice_directory');
      setInvoiceTree(response.data.invoice_tree);
    } catch (err: any) {
      console.error('請求書ディレクトリ取得エラー:', err);
      setError('請求書ディレクトリの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptClick = (receipt: ReceiptItem) => {
    setSelectedReceipt(receipt);
    setPreviewOpen(true);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setSelectedReceipt(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBackToTable = () => {
    navigate('/invoices');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const years = Object.keys(invoiceTree).sort().reverse();

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton color="inherit" onClick={handleBackToTable} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            請求書ディレクトリ
          </Typography>
          <Typography variant="body1" sx={{ mr: 2 }}>
            {user?.name} さん
          </Typography>
          <IconButton color="inherit" onClick={handleLogout}>
            <LogoutIcon />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        {years.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1" color="text.secondary">
              請求書が登録されていません
            </Typography>
          </Paper>
        ) : (
          years.map((year) => (
            <Accordion key={year} defaultExpanded={year === years[0]}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <FolderIcon sx={{ mr: 1 }} />
                <Typography variant="h6">{year}年</Typography>
              </AccordionSummary>
              <AccordionDetails>
                {Object.keys(invoiceTree[year])
                  .sort()
                  .reverse()
                  .map((month) => (
                    <Accordion key={`${year}-${month}`}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <FolderIcon sx={{ mr: 1 }} />
                        <Typography>{month}月</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {Object.keys(invoiceTree[year][month])
                          .sort()
                          .reverse()
                          .map((day) => (
                            <Accordion key={`${year}-${month}-${day}`}>
                              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                                <FolderIcon sx={{ mr: 1 }} />
                                <Typography>{day}日 ({invoiceTree[year][month][day].length}件)</Typography>
                              </AccordionSummary>
                              <AccordionDetails>
                                <Grid container spacing={2}>
                                  {invoiceTree[year][month][day].map((receipt) => (
                                    <Grid item xs={12} sm={6} md={4} lg={3} key={receipt.id}>
                                      <Card
                                        sx={{ cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                                        onClick={() => handleReceiptClick(receipt)}
                                      >
                                        {!receipt.is_pdf ? (
                                          <CardMedia
                                            component="img"
                                            height="200"
                                            image={receipt.receipt_url}
                                            alt={`Receipt ${receipt.id}`}
                                            sx={{ objectFit: 'contain', bgcolor: '#f5f5f5' }}
                                          />
                                        ) : (
                                          <Box
                                            sx={{
                                              height: 200,
                                              display: 'flex',
                                              alignItems: 'center',
                                              justifyContent: 'center',
                                              bgcolor: '#f5f5f5',
                                            }}
                                          >
                                            <Typography variant="h6" color="text.secondary">
                                              PDF
                                            </Typography>
                                          </Box>
                                        )}
                                        <CardContent>
                                          <Typography variant="body2" color="text.secondary">
                                            ユーザー: {receipt.user_name}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            支払先: {receipt.payee || '未設定'}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            金額: {receipt.amount ? `¥${receipt.amount.toLocaleString()}` : '未設定'}
                                          </Typography>
                                        </CardContent>
                                      </Card>
                                    </Grid>
                                  ))}
                                </Grid>
                              </AccordionDetails>
                            </Accordion>
                          ))}
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Container>

      {/* 請求書プレビューダイアログ */}
      <Dialog open={previewOpen} onClose={handlePreviewClose} maxWidth="md" fullWidth>
        <DialogTitle>
          請求書詳細
          {selectedReceipt && (
            <Typography variant="body2" color="text.secondary">
              {selectedReceipt.user_name} - {new Date(selectedReceipt.date).toLocaleDateString('ja-JP')}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {selectedReceipt && (
            <>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2">
                  <strong>支払先:</strong> {selectedReceipt.payee || '未設定'}
                </Typography>
                <Typography variant="body2">
                  <strong>金額:</strong>{' '}
                  {selectedReceipt.amount ? `¥${selectedReceipt.amount.toLocaleString()}` : '未設定'}
                </Typography>
              </Box>
              {selectedReceipt.is_pdf ? (
                <Box
                  component="iframe"
                  src={selectedReceipt.receipt_url}
                  sx={{
                    width: '100%',
                    height: '70vh',
                    border: 'none',
                  }}
                />
              ) : (
                <Box
                  component="img"
                  src={selectedReceipt.receipt_url}
                  alt="請求書画像"
                  sx={{
                    width: '100%',
                    height: 'auto',
                    maxHeight: '70vh',
                    objectFit: 'contain',
                  }}
                />
              )}
            </>
          )}
        </DialogContent>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button onClick={handlePreviewClose}>閉じる</Button>
        </Box>
      </Dialog>
    </Box>
  );
};

export default InvoiceDirectory;
