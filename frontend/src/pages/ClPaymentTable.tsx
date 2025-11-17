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
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import FolderIcon from '@mui/icons-material/Folder';
import { useAuth } from '../contexts/AuthContext';
import { ClPayment } from '../types';
import api from '../services/api';

interface ClPaymentTableProps {
  hideAppBar?: boolean;
}

// ローカル時刻でYYYY-MM-DD形式の文字列に変換するヘルパー関数
const formatDateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const ClPaymentTable = ({ hideAppBar = false }: ClPaymentTableProps = {}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const apiRef = useGridApiRef();
  const [allRows, setAllRows] = useState<GridRowsProp>([]);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');

  useEffect(() => {
    fetchClPayments();
  }, []);

  const fetchClPayments = async () => {
    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows([]);
      return [];
    }

    try {
      const response = await api.get('/cl_payments');
      // 日付をDateオブジェクトに変換
      const clPayments = response.data.map((cp: any) => ({
        ...cp,
        payment_date: cp.payment_date ? new Date(cp.payment_date) : null,
      }));
      console.log('Fetched CL payments:', clPayments);
      setAllRows(clPayments);
      return clPayments;
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
      if (row.payment_date) {
        try {
          const date = row.payment_date instanceof Date ? row.payment_date : new Date(row.payment_date);
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
        if (!row.payment_date) return false;
        try {
          const date = row.payment_date instanceof Date ? row.payment_date : new Date(row.payment_date);
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
      payment_date: null,
      payment_amount: null,
      vendor: '',
      description: '',
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

      // ファイル削除時は全フィールドを空文字列として送信
      if (newRow.remove_payment_file) {
        formData.append('payment_date', '');
        formData.append('payment_amount', '');
        formData.append('vendor', '');
        formData.append('description', '');
      } else {
        // 日付データの処理
        if (newRow.payment_date) {
          const date = newRow.payment_date instanceof Date ? newRow.payment_date : new Date(newRow.payment_date);
          if (!isNaN(date.getTime())) {
            const localDateStr = formatDateToLocalString(date);
            formData.append('payment_date', localDateStr);
          }
        }

        // 金額データの処理
        if (newRow.payment_amount !== null && newRow.payment_amount !== undefined && newRow.payment_amount !== '') {
          formData.append('payment_amount', String(newRow.payment_amount));
        }

        // 注文先
        if (newRow.vendor) {
          formData.append('vendor', newRow.vendor);
        }

        // 摘要
        if (newRow.description) {
          formData.append('description', newRow.description);
        }
      }

      // PDFまたは画像ファイルの処理
      if (newRow.paymentFile) {
        formData.append('payment_file', newRow.paymentFile);
      }

      // 既存データの削除フラグ
      if (newRow.remove_payment_file) {
        formData.append('remove_payment_file', 'true');
      }

      let response;
      if (newRow.isNew) {
        response = await api.post('/cl_payments', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        response = await api.put(`/cl_payments/${newRow.id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      const savedClPayment = response.data;
      const updatedRow = {
        ...savedClPayment,
        payment_date: savedClPayment.payment_date ? new Date(savedClPayment.payment_date) : null,
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

    if (!window.confirm('このCL決済を削除してもよろしいですか?')) {
      return;
    }

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows(allRows.filter((r: any) => r.id !== id));
      return;
    }

    try {
      await api.delete(`/cl_payments/${id}`);
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
    navigate('/cl-payment-directory');
  };

  const columns: GridColDef[] = useMemo(() => [
    {
      field: 'payment_date',
      headerName: '決済日付',
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
      field: 'payment_amount',
      headerName: '決済額',
      width: 130,
      type: 'number',
      editable: true,
      align: 'right',
      headerAlign: 'right',
    },
    {
      field: 'vendor',
      headerName: '注文先',
      width: 200,
      editable: true,
    },
    {
      field: 'description',
      headerName: '摘要',
      width: 250,
      editable: true,
    },
    {
      field: 'payment_file_url',
      headerName: '支払い内容',
      width: 150,
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
                accept="application/pdf,image/jpeg,image/png,image/jpg"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const updatedRow = { ...params.row, paymentFile: file, remove_payment_file: false };
                    handleSaveRow(updatedRow);
                  }
                }}
              />
              <Typography variant="caption" color="primary">
                ファイル追加
              </Typography>
            </Box>
          );
        }

        return (
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <IconButton
              size="small"
              onClick={() => window.open(params.row.payment_file_url, '_blank')}
              title="ファイルを開く"
            >
              {params.row.is_pdf ? (
                <PictureAsPdfIcon fontSize="small" />
              ) : (
                <ImageIcon fontSize="small" />
              )}
            </IconButton>
            <IconButton
              size="small"
              color="error"
              onClick={() => {
                if (window.confirm('ファイルを削除しますか?')) {
                  const updatedRow = {
                    ...params.row,
                    paymentFile: null,
                    remove_payment_file: true,
                    payment_date: null,
                    payment_amount: null,
                    vendor: '',
                    description: ''
                  };
                  handleSaveRow(updatedRow);
                }
              }}
              title="ファイルを削除"
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
        <AppBar position="static" sx={{ bgcolor: '#ff9800' }}>
          <Toolbar>
            <Typography variant={isMobile ? 'body1' : 'h6'} component="div" sx={{ flexGrow: 0, mr: 2, fontWeight: 'bold' }}>
              CL決済管理
            </Typography>
            {user?.role === 'superadmin' && (
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
                CL決済ディレクトリ
              </Button>
            )}
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
          <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddRow} sx={{ bgcolor: '#ff9800', '&:hover': { bgcolor: '#f57c00' } }}>
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

export default ClPaymentTable;
