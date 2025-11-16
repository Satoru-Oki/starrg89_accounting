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
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';

interface PaymentItem {
  id: number;
  user_id: number;
  user_name: string;
  date: string;
  sales_amount: number | null;
  transfer_amount: number | null;
  payment_file_url: string;
  is_pdf: boolean;
}

interface PaymentTree {
  [year: string]: {
    [month: string]: {
      [day: string]: PaymentItem[];
    };
  };
}

const PaymentDirectory = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [paymentTree, setPaymentTree] = useState<PaymentTree>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentItem | null>(null);

  useEffect(() => {
    // スーパー管理者以外はリダイレクト
    if (user?.role !== 'superadmin') {
      navigate('/');
      return;
    }

    fetchPaymentDirectory();
  }, [user, navigate]);

  const fetchPaymentDirectory = async () => {
    try {
      setLoading(true);
      const response = await api.get('/payment_details/payment_directory');
      setPaymentTree(response.data.payment_tree);
    } catch (err: any) {
      console.error('収納明細ディレクトリ取得エラー:', err);
      setError('収納明細ディレクトリの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentClick = (payment: PaymentItem) => {
    setSelectedPayment(payment);
    setPreviewOpen(true);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
    setSelectedPayment(null);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleBackToTable = () => {
    navigate('/payment-details');
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const years = Object.keys(paymentTree).sort().reverse();

  return (
    <Box sx={{ flexGrow: 1 }}>
      <AppBar position="static" sx={{ bgcolor: '#9c27b0' }}>
        <Toolbar>
          <IconButton color="inherit" onClick={handleBackToTable} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            収納明細ディレクトリ
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
              収納明細が登録されていません
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
                {Object.keys(paymentTree[year])
                  .sort()
                  .reverse()
                  .map((month) => (
                    <Accordion key={month}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <FolderIcon sx={{ mr: 1 }} />
                        <Typography>{month}月</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        {Object.keys(paymentTree[year][month])
                          .sort()
                          .reverse()
                          .map((day) => (
                            <Box key={day} sx={{ mb: 3 }}>
                              <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 'bold' }}>
                                {month}月{day}日
                              </Typography>
                              <Grid container spacing={2}>
                                {paymentTree[year][month][day].map((payment) => (
                                  <Grid item xs={12} sm={6} md={4} lg={3} key={payment.id}>
                                    <Card
                                      sx={{
                                        cursor: 'pointer',
                                        '&:hover': {
                                          boxShadow: 6,
                                          transform: 'translateY(-2px)',
                                          transition: 'all 0.2s',
                                        },
                                        borderLeft: '4px solid #9c27b0',
                                      }}
                                      onClick={() => handlePaymentClick(payment)}
                                    >
                                      <Box
                                        sx={{
                                          height: 120,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          bgcolor: '#f5f5f5',
                                        }}
                                      >
                                        <PictureAsPdfIcon sx={{ fontSize: 60, color: '#9c27b0' }} />
                                      </Box>
                                      <CardContent>
                                        <Typography variant="body2" color="text.secondary">
                                          {payment.user_name}
                                        </Typography>
                                        {payment.sales_amount !== null && (
                                          <Typography variant="body2" color="text.secondary">
                                            売上: ¥{payment.sales_amount.toLocaleString()}
                                          </Typography>
                                        )}
                                        {payment.transfer_amount !== null && (
                                          <Typography variant="body2" color="text.secondary">
                                            振込: ¥{payment.transfer_amount.toLocaleString()}
                                          </Typography>
                                        )}
                                        <Typography variant="caption" color="text.secondary">
                                          {new Date(payment.date).toLocaleDateString('ja-JP')}
                                        </Typography>
                                      </CardContent>
                                    </Card>
                                  </Grid>
                                ))}
                              </Grid>
                            </Box>
                          ))}
                      </AccordionDetails>
                    </Accordion>
                  ))}
              </AccordionDetails>
            </Accordion>
          ))
        )}
      </Container>

      {/* プレビューダイアログ */}
      <Dialog open={previewOpen} onClose={handlePreviewClose} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">収納明細プレビュー</Typography>
            <Button
              variant="contained"
              onClick={() => selectedPayment && window.open(selectedPayment.payment_file_url, '_blank')}
              sx={{ bgcolor: '#9c27b0', '&:hover': { bgcolor: '#7b1fa2' } }}
            >
              新しいタブで開く
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          {selectedPayment && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">ユーザー: {selectedPayment.user_name}</Typography>
              <Typography variant="body2" color="text.secondary">
                入金予定日: {new Date(selectedPayment.date).toLocaleDateString('ja-JP')}
              </Typography>
              {selectedPayment.sales_amount !== null && (
                <Typography variant="body2" color="text.secondary">
                  売上金額: ¥{selectedPayment.sales_amount.toLocaleString()}
                </Typography>
              )}
              {selectedPayment.transfer_amount !== null && (
                <Typography variant="body2" color="text.secondary">
                  振込金額: ¥{selectedPayment.transfer_amount.toLocaleString()}
                </Typography>
              )}
            </Box>
          )}
          {selectedPayment && (
            <Box sx={{ width: '100%', height: '70vh' }}>
              <iframe
                src={selectedPayment.payment_file_url}
                style={{ width: '100%', height: '100%', border: 'none' }}
                title="PDF Preview"
              />
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default PaymentDirectory;
