import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  Typography,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { DataGrid, GridColDef, GridRowsProp, GridActionsCellItem, GridRowId, useGridApiRef } from '@mui/x-data-grid';
import AddIcon from '@mui/icons-material/Add';
import LogoutIcon from '@mui/icons-material/Logout';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import FolderIcon from '@mui/icons-material/Folder';
import { useAuth } from '../contexts/AuthContext';
import { PaymentDetail } from '../types';
import api from '../services/api';

interface PaymentDetailsTableProps {
  hideAppBar?: boolean;
}

// ローカル時刻でYYYY-MM-DD形式の文字列に変換するヘルパー関数
const formatDateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PaymentDetailsTable = ({ hideAppBar = false }: PaymentDetailsTableProps = {}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const apiRef = useGridApiRef();
  const [allRows, setAllRows] = useState<GridRowsProp>([]);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => {
    fetchPaymentDetails();
  }, []);

  const fetchPaymentDetails = async () => {
    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows([]);
      return [];
    }

    try {
      const response = await api.get('/payment_details');
      // 日付をDateオブジェクトに変換
      const paymentDetails = response.data.map((pd: any) => ({
        ...pd,
        deposit_date: pd.deposit_date ? new Date(pd.deposit_date) : null,
      }));
      console.log('Fetched payment details:', paymentDetails);
      setAllRows(paymentDetails);
      return paymentDetails;
    } catch (err: any) {
      console.error('API Error:', err);
      setAllRows([]);
      return [];
    }
  };

  // 月のリストを生成
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    allRows.forEach((row: any) => {
      if (row.deposit_date) {
        try {
          const date = row.deposit_date instanceof Date ? row.deposit_date : new Date(row.deposit_date);
          if (!isNaN(date.getTime())) {
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            months.add(monthKey);
          }
        } catch (e) {
          console.error('Date parsing error:', e);
        }
      }
    });
    return Array.from(months).sort().reverse();
  }, [allRows]);

  // 月別にフィルタリングされたデータ
  const filteredRows = useMemo(() => {
    return allRows.filter((row: any) => {
      // 月フィルター
      if (selectedMonth !== 'all') {
        if (row.isNew) return true;
        if (!row.deposit_date) return false;
        try {
          const date = row.deposit_date instanceof Date ? row.deposit_date : new Date(row.deposit_date);
          if (isNaN(date.getTime())) return false;
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthKey !== selectedMonth) return false;
        } catch (e) {
          return false;
        }
      }

      return true;
    });
  }, [allRows, selectedMonth]);

  const handleAddRow = () => {
    const newId = `new-${Date.now()}`;

    const newRow: any = {
      id: newId,
      deposit_date: null,
      sales_amount: null,
      commission_fee: null,
      consumption_tax: null,
      transfer_amount: null,
      isNew: true,
      user_id: user?.id,
      user_name: user?.name || '',
    };

    // 最下段に追加
    setAllRows([...allRows, newRow]);
  };

  const handleSaveRow = async (newRow: any) => {
    console.log('=== handleSaveRow START ===');
    console.log('Input row data:', newRow);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      const updatedRows = allRows.map((r: any) => (r.id === newRow.id ? newRow : r));
      setAllRows(updatedRows);
      return newRow;
    }

    try {
      const formData = new FormData();

      // PDF削除時は全フィールドを空文字列として送信
      if (newRow.remove_payment_file) {
        formData.append('deposit_date', '');
        formData.append('sales_amount', '');
        formData.append('commission_fee', '');
        formData.append('consumption_tax', '');
        formData.append('transfer_amount', '');
      } else {
        // 日付データの処理
        if (newRow.deposit_date) {
          const date = newRow.deposit_date instanceof Date ? newRow.deposit_date : new Date(newRow.deposit_date);
          if (!isNaN(date.getTime())) {
            const localDateStr = formatDateToLocalString(date);
            formData.append('deposit_date', localDateStr);
          }
        }

        // 金額データの処理
        if (newRow.sales_amount !== null && newRow.sales_amount !== undefined && newRow.sales_amount !== '') {
          formData.append('sales_amount', String(newRow.sales_amount));
        }
        if (newRow.commission_fee !== null && newRow.commission_fee !== undefined && newRow.commission_fee !== '') {
          formData.append('commission_fee', String(newRow.commission_fee));
        }
        if (newRow.consumption_tax !== null && newRow.consumption_tax !== undefined && newRow.consumption_tax !== '') {
          formData.append('consumption_tax', String(newRow.consumption_tax));
        }
        if (newRow.transfer_amount !== null && newRow.transfer_amount !== undefined && newRow.transfer_amount !== '') {
          formData.append('transfer_amount', String(newRow.transfer_amount));
        }
      }

      // PDFファイルの処理
      if (newRow.paymentFile) {
        formData.append('payment_file', newRow.paymentFile);
      }

      // 既存データの削除フラグ
      if (newRow.remove_payment_file) {
        formData.append('remove_payment_file', 'true');
      }

      let response;
      if (newRow.isNew) {
        response = await api.post('/payment_details', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await api.put(`/payment_details/${newRow.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      const savedPaymentDetail = response.data;
      const updatedRow = {
        ...savedPaymentDetail,
        deposit_date: savedPaymentDetail.deposit_date ? new Date(savedPaymentDetail.deposit_date) : null,
        isNew: false,
      };

      const updatedRows = allRows.map((r: any) => (r.id === newRow.id ? updatedRow : r));
      setAllRows(updatedRows);

      return updatedRow;
    } catch (err: any) {
      console.error('Save error:', err);
      setError(err.response?.data?.error || err.response?.data?.errors?.join(', ') || '保存に失敗しました');
      throw err;
    }
  };

  const handleDeleteRow = async (id: GridRowId) => {
    const row = allRows.find((r: any) => r.id === id);

    if (row.isNew) {
      setAllRows(allRows.filter((r: any) => r.id !== id));
      return;
    }

    if (!window.confirm('この収納明細を削除してもよろしいですか?')) {
      return;
    }

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows(allRows.filter((r: any) => r.id !== id));
      return;
    }

    try {
      await api.delete(`/payment_details/${id}`);
      setAllRows(allRows.filter((r: any) => r.id !== id));
    } catch (err: any) {
      setError(err.response?.data?.error || '削除に失敗しました');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleDirectoryClick = () => {
    navigate('/payment-directory');
  };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'deposit_date',
      headerName: '入金予定日',
      width: 150,
      type: 'date',
      editable: true,
      valueFormatter: (params) => {
        if (!params.value) return '';
        const date = params.value instanceof Date ? params.value : new Date(params.value);
        return isNaN(date.getTime()) ? '' : formatDateToLocalString(date);
      },
    },
    {
      field: 'sales_amount',
      headerName: '売上金額',
      width: 130,
      type: 'number',
      editable: true,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'commission_fee',
      headerName: '手数料',
      width: 120,
      type: 'number',
      editable: true,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'consumption_tax',
      headerName: '消費税',
      width: 120,
      type: 'number',
      editable: true,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'transfer_amount',
      headerName: '振込金額',
      width: 130,
      type: 'number',
      editable: true,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'sales_total',
      headerName: '売上合計',
      width: 130,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      valueGetter: (params) => {
        // 表示されているfilteredRowsの中で最も新しい日付を見つける
        const latestDate = filteredRows.reduce((latest: Date | null, row: any) => {
          if (!row.deposit_date) return latest;
          const date = row.deposit_date instanceof Date ? row.deposit_date : new Date(row.deposit_date);
          if (!latest || date > latest) return date;
          return latest;
        }, null);

        // 現在の行が最新日付の行かどうかチェック
        if (!params.row.deposit_date || !latestDate) return null;
        const currentDate = params.row.deposit_date instanceof Date ? params.row.deposit_date : new Date(params.row.deposit_date);
        if (currentDate.getTime() !== latestDate.getTime()) return null;

        // 売上金額の合計を計算
        const total = filteredRows.reduce((sum: number, row: any) => {
          return sum + (row.sales_amount || 0);
        }, 0);

        return total;
      },
    },
    {
      field: 'transfer_total',
      headerName: '振込合計',
      width: 130,
      type: 'number',
      align: 'right',
      headerAlign: 'right',
      valueGetter: (params) => {
        // 表示されているfilteredRowsの中で最も新しい日付を見つける
        const latestDate = filteredRows.reduce((latest: Date | null, row: any) => {
          if (!row.deposit_date) return latest;
          const date = row.deposit_date instanceof Date ? row.deposit_date : new Date(row.deposit_date);
          if (!latest || date > latest) return date;
          return latest;
        }, null);

        // 現在の行が最新日付の行かどうかチェック
        if (!params.row.deposit_date || !latestDate) return null;
        const currentDate = params.row.deposit_date instanceof Date ? params.row.deposit_date : new Date(params.row.deposit_date);
        if (currentDate.getTime() !== latestDate.getTime()) return null;

        // 振込金額の合計を計算
        const total = filteredRows.reduce((sum: number, row: any) => {
          return sum + (row.transfer_amount || 0);
        }, 0);

        return total;
      },
    },
    {
      field: 'payment_file_url',
      headerName: 'PDF',
      width: 100,
      renderCell: (params) => {
        if (!params.row.payment_file_url) {
          return (
                <Box
                  component="label"
                  sx={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    height: '100%',
                    '&:hover': { bgcolor: 'action.hover' },
                  }}
                >
                  <input
                    type="file"
                    hidden
                    accept="application/pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const updatedRow = { ...params.row, paymentFile: file, remove_payment_file: false };
                        handleSaveRow(updatedRow);
                      }
                    }}
                  />
                  <Typography variant="caption" color="primary">
                    PDF追加
                  </Typography>
                </Box>
              );
        }

        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <IconButton
              size="small"
              onClick={() => window.open(params.row.payment_file_url, '_blank')}
              title="PDFを開く"
            >
              <PictureAsPdfIcon fontSize="small" />
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                if (window.confirm('PDFを削除しますか?')) {
                  const updatedRow = {
                    ...params.row,
                    paymentFile: null,
                    remove_payment_file: true,
                    deposit_date: null,
                    sales_amount: null,
                    commission_fee: null,
                    consumption_tax: null,
                    transfer_amount: null
                  };
                  handleSaveRow(updatedRow);
                }
              }}
              title="PDFを削除"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Box>
        );
      },
    },
    {
      field: 'actions',
      type: 'actions',
      headerName: '操作',
      width: 100,
      getActions: (params) => [
        <GridActionsCellItem
          icon={<SaveIcon />}
          label="保存"
          onClick={() => handleSaveRow(params.row)}
        />,
        <GridActionsCellItem
          icon={<DeleteIcon />}
          label="削除"
          onClick={() => handleDeleteRow(params.id)}
        />,
      ],
    },
  ], [filteredRows]);

  return (
    <Box>
      {!hideAppBar && (
        <AppBar position="static" sx={{ bgcolor: '#9c27b0' }}>
          <Toolbar>
            <Typography variant={isMobile ? 'body1' : 'h6'} component="div" sx={{ flexGrow: 0, mr: 2, fontWeight: 'bold' }}>
              収納明細管理
            </Typography>
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
              収納明細ディレクトリ
            </Button>
            <Box sx={{ flexGrow: 1 }} />
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
      )}
      <Container maxWidth={false} sx={{ mt: 2, px: { xs: 1, sm: 2 } }}>
        {error && (
          <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow} sx={{ bgcolor: '#9c27b0', '&:hover': { bgcolor: '#7b1fa2' } }}>
            新規追加
          </Button>
          <FormControl sx={{ minWidth: 200 }}>
            <InputLabel>月でフィルタ</InputLabel>
            <Select
              value={selectedMonth}
              label="月でフィルタ"
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <MenuItem value="all">すべて</MenuItem>
              {availableMonths.map((month) => (
                <MenuItem key={month} value={month}>
                  {month}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box sx={{ height: 'calc(100vh - 250px)', width: '100%' }}>
          <DataGrid
            apiRef={apiRef}
            rows={filteredRows}
            columns={columns}
            processRowUpdate={handleSaveRow}
            onProcessRowUpdateError={(error) => {
              console.error('Row update error:', error);
              setError('行の更新に失敗しました');
            }}
            initialState={{
              pagination: { paginationModel: { pageSize: 100 } },
            }}
            pageSizeOptions={[10, 25, 50, 100]}
          />
        </Box>
      </Container>
    </Box>
  );
};

export default PaymentDetailsTable;
