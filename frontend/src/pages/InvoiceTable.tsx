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
import { Transaction } from '../types';
import api from '../services/api';
import { PDFExportButton } from '../components/PDFExport';
import { ReceiptUpload } from '../components/ReceiptUpload';

interface InvoiceTableProps {
  hideAppBar?: boolean;
}

// ローカル時刻でYYYY-MM-DD形式の文字列に変換するヘルパー関数
const formatDateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const InvoiceTable = ({ hideAppBar = false }: InvoiceTableProps = {}) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const apiRef = useGridApiRef();
  const [allRows, setAllRows] = useState<GridRowsProp>([]);
  const [error, setError] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [initialLoadDate] = useState<string>(() => {
    // ページ読み込み日付（YYYY-MM-DD形式）
    const now = new Date();
    const dateStr = formatDateToLocalString(now);
    console.log('Initial load date:', dateStr);
    return dateStr;
  });

  // 更新確認日時（ローカルストレージから取得、管理者とスーパー管理者）
  const [lastConfirmedDate, setLastConfirmedDate] = useState<string>(() => {
    if (user?.role === 'admin' || user?.role === 'superadmin') {
      return localStorage.getItem('lastConfirmedDate') || '';
    }
    return '';
  });

  const invoiceStatuses = [
    '支払い済',
    '未払い',
  ];

  useEffect(() => {
    fetchInvoices();
  }, []);

  const fetchInvoices = async () => {
    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows([]);
      return [];
    }

    try {
      const response = await api.get('/invoices');
      // 日付をDateオブジェクトに変換
      const invoices = response.data.map((t: any) => ({
        ...t,
        invoice_date: t.invoice_date ? new Date(t.invoice_date) : null,
      }));
      console.log('Fetched invoices:', invoices);
      console.log('First invoice updated_at:', invoices[0]?.updated_at);
      setAllRows(invoices);
      return invoices;
    } catch (err: any) {
      console.error('API Error:', err);
      setAllRows([]);
      return [];
    }
  };

  // ユーザーのリストを生成（管理者とスーパー管理者）
  const availableUsers = useMemo(() => {
    if (user?.role !== 'admin' && user?.role !== 'superadmin') return [];
    const users = new Set<string>();
    allRows.forEach((row: any) => {
      if (row.user_name) {
        // adminの場合はokiを除外
        if (user?.role === 'admin' && row.user_login_id === 'oki') {
          return;
        }
        users.add(row.user_name);
      }
    });
    return Array.from(users).sort();
  }, [allRows, user?.role]);

  // 月のリストを生成
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    allRows.forEach((row: any) => {
      if (row.invoice_date) {
        try {
          const date = row.invoice_date instanceof Date ? row.invoice_date : new Date(row.invoice_date);
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

  // ユーザー別・月別にフィルタリングされたデータ
  const filteredRows = useMemo(() => {
    return allRows.filter((row: any) => {
      // ユーザーフィルター（管理者とスーパー管理者）
      if ((user?.role === 'admin' || user?.role === 'superadmin') && selectedUser !== 'all') {
        if (row.isNew) return true;
        if (row.user_name !== selectedUser) return false;
      }

      // 月フィルター
      if (selectedMonth !== 'all') {
        if (row.isNew) return true;
        if (!row.invoice_date) return false;
        try {
          const date = row.invoice_date instanceof Date ? row.invoice_date : new Date(row.invoice_date);
          if (isNaN(date.getTime())) return false;
          const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          if (monthKey !== selectedMonth) return false;
        } catch (e) {
          return false;
        }
      }

      return true;
    });
  }, [allRows, selectedMonth, selectedUser, user?.role]);

  // カメラキャプチャイベントのリスナー
  useEffect(() => {
    const handleCameraCapture = (event: any) => {
      const { file, mode } = event.detail;
      if (mode === 'invoices') {
        // 新しい行を追加してファイルを設定
        const newId = `new-${Date.now()}`;
        const newRow: any = {
          id: newId,
          invoice_date: null,
          invoice_amount: null,
          invoice_from: '',
          description: '',
          invoice_status: '未添付',
          isNew: true,
          user_id: user?.id,
          user_name: user?.name || '',
          invoiceFile: file, // カメラで撮影したファイルを設定
        };

        const updatedRows = [...allRows, newRow];
        setAllRows(updatedRows);
      }
    };

    window.addEventListener('cameraCapture', handleCameraCapture);
    return () => {
      window.removeEventListener('cameraCapture', handleCameraCapture);
    };
  }, [allRows, user]);

  const handleAddRow = () => {
    const newId = `new-${Date.now()}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newRow: any = {
      id: newId,
      invoice_date: null, // OCRで読み取った日付を優先するため、初期値はnull
      invoice_amount: null,
      client: '',
      description: '',
      status: '未払い',
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
    console.log('Has invoiceFile?', !!newRow.invoiceFile);
    console.log('invoiceFile:', newRow.invoiceFile);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      const updatedRows = allRows.map((r: any) => (r.id === newRow.id ? newRow : r));
      setAllRows(updatedRows);
      return newRow;
    }

    try {
      // 日付をYYYY-MM-DD形式に変換
      console.log('Raw date value:', newRow.invoice_date);
      console.log('Date type:', typeof newRow.invoice_date);
      console.log('Is Date object:', newRow.invoice_date instanceof Date);

      let dateValue = '';

      // 日付の検証と変換
      if (newRow.invoice_date === null || newRow.invoice_date === undefined || newRow.invoice_date === '') {
        const errorMsg = '日付を入力してください';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      if (newRow.invoice_date instanceof Date) {
        // Dateオブジェクトの場合
        if (isNaN(newRow.invoice_date.getTime())) {
          throw new Error('無効な日付です');
        }
        dateValue = formatDateToLocalString(newRow.invoice_date);
      } else if (typeof newRow.invoice_date === 'string') {
        // 文字列の場合
        if (newRow.invoice_date.includes('T')) {
          // ISO形式 "2025-11-09T00:00:00.000Z"
          dateValue = newRow.invoice_date.split('T')[0];
        } else if (newRow.invoice_date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // 既にYYYY-MM-DD形式
          dateValue = newRow.invoice_date;
        } else {
          // その他の形式を試す
          const parsedDate = new Date(newRow.invoice_date);
          if (!isNaN(parsedDate.getTime())) {
            dateValue = formatDateToLocalString(parsedDate);
          }
        }
      } else if (typeof newRow.invoice_date === 'number') {
        // タイムスタンプの場合
        const parsedDate = new Date(newRow.invoice_date);
        if (!isNaN(parsedDate.getTime())) {
          dateValue = formatDateToLocalString(parsedDate);
        }
      }

      console.log('Converted date:', dateValue);

      if (!dateValue) {
        const errorMsg = '日付の形式が正しくありません';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      // 請求書画像がある場合はFormDataを使用、ない場合はJSONで送信
      let response;
      const hasInvoiceFile = !!newRow.invoiceFile;

      if (hasInvoiceFile) {
        // FormDataで送信（請求書画像あり）
        const formData = new FormData();
        formData.append('invoice_date', dateValue);
        formData.append('description', newRow.description || '');
        formData.append('status', newRow.status || '未払い');
        formData.append('client', newRow.client || '');

        // 請求額の検証
        if (newRow.invoice_amount != null && newRow.invoice_amount !== '') {
          const invoiceAmountValue = Number(newRow.invoice_amount);
          if (isNaN(invoiceAmountValue)) {
            throw new Error('請求額は数値で入力してください');
          }
          if (invoiceAmountValue > 99999999) {
            throw new Error('請求額は99,999,999円以下で入力してください');
          }
          if (invoiceAmountValue < 0) {
            throw new Error('請求額は0以上で入力してください');
          }
          formData.append('invoice_amount', invoiceAmountValue.toString());
        } else {
          // 空の場合は空文字列を送信してフィールドをクリア
          formData.append('invoice_amount', '');
        }

        // 請求書画像を追加
        // BlobをFileに変換（必要に応じて）
        const invoiceFile = newRow.invoiceFile instanceof Blob && !(newRow.invoiceFile instanceof File)
          ? new File([newRow.invoiceFile], newRow.invoiceFile.name || 'invoice.jpg', { type: newRow.invoiceFile.type })
          : newRow.invoiceFile;
        formData.append('invoice', invoiceFile);

        console.log('Sending with invoice file');

        if (newRow.isNew) {
          console.log('Creating new invoice with file...');
          response = await api.post('/invoices', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        } else {
          console.log('Updating invoice ID with file:', newRow.id);
          response = await api.put(`/invoices/${newRow.id}`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        }
      } else {
        // JSONで送信（請求書画像なし）
        const invoiceData: any = {
          invoice_date: dateValue,
          description: newRow.description || '',
          status: newRow.status || '未払い',
          client: newRow.client || '',
        };

        // 請求額の検証
        if (newRow.invoice_amount != null && newRow.invoice_amount !== '') {
          const invoiceAmountValue = Number(newRow.invoice_amount);
          if (isNaN(invoiceAmountValue)) {
            throw new Error('請求額は数値で入力してください');
          }
          if (invoiceAmountValue > 99999999) {
            throw new Error('請求額は99,999,999円以下で入力してください');
          }
          if (invoiceAmountValue < 0) {
            throw new Error('請求額は0以上で入力してください');
          }
          invoiceData.invoice_amount = invoiceAmountValue;
        } else {
          // 空の場合はnullを送信してフィールドをクリア
          invoiceData.invoice_amount = null;
        }

        console.log('Invoice data to send:', JSON.stringify(invoiceData, null, 2));

        if (newRow.isNew) {
          console.log('Creating new invoice...');
          response = await api.post('/invoices', invoiceData);
        } else {
          console.log('Updating invoice ID:', newRow.id);
          response = await api.put(`/invoices/${newRow.id}`, invoiceData);
        }
      }

      console.log('API Response:', JSON.stringify(response.data, null, 2));

      // データを再取得して、更新された行を取得
      console.log('Fetching updated invoices...');
      const updatedInvoices = await fetchInvoices();

      // 保存/更新した行をIDで検索
      const savedRowId = response.data.id;
      const updatedRow = updatedInvoices.find((t: any) => t.id === savedRowId);

      console.log('=== handleSaveRow SUCCESS ===');
      console.log('Updated row from fetch:', JSON.stringify(updatedRow, null, 2));

      if (!updatedRow) {
        console.warn('Could not find updated row, returning response.data');
        return {
          ...response.data,
          isNew: false,
        };
      }

      // 再取得したデータを返す
      const resultRow = {
        ...updatedRow,
        isNew: false,
      };
      console.log('Returning row:', JSON.stringify(resultRow, null, 2));
      return resultRow;
    } catch (err: any) {
      console.error('=== handleSaveRow ERROR ===');
      console.error('Error details:', err);
      console.error('Error message:', err.message);
      console.error('Error response:', err.response?.data);

      const errorMsg = err.response?.data?.message || err.message || '保存に失敗しました';
      setError(errorMsg);
      throw err;
    }
  };

  const handleSaveAll = async () => {
    try {
      setError('');
      console.log('=== handleSaveAll START ===');

      // 新規行と編集された既存行のみを保存
      const newRows = allRows.filter((row: any) => row.isNew);
      const dirtyRows = allRows.filter((row: any) => !row.isNew && row.isDirty && typeof row.id === 'number');

      console.log('New rows:', newRows.length);
      console.log('Dirty rows:', dirtyRows.length);
      console.log('Dirty rows data:', dirtyRows.map(r => ({ id: r.id, hasInvoiceFile: !!r.invoiceFile })));

      if (newRows.length === 0 && dirtyRows.length === 0) {
        alert('保存するデータがありません');
        return;
      }

      // 各行を保存
      for (const row of [...newRows, ...dirtyRows]) {
        await handleSaveRow(row);
      }

      // 全データを再取得して更新日を反映
      console.log('Refreshing all data...');
      const refreshedData = await fetchInvoices();
      setAllRows(refreshedData);

      console.log('=== handleSaveAll SUCCESS ===');
      alert('すべてのデータを保存しました');
    } catch (err: any) {
      console.error('=== handleSaveAll ERROR ===', err);
      setError('一部のデータの保存に失敗しました');
    }
  };

  const handleConfirmUpdates = () => {
    const now = new Date();
    const dateStr = formatDateToLocalString(now);
    setLastConfirmedDate(dateStr);
    localStorage.setItem('lastConfirmedDate', dateStr);
    console.log('Updates confirmed on:', dateStr);
    alert('更新を確認しました');
  };

  const handleReceiptUpload = (rowId: GridRowId) => async (file: File, ocrData: any) => {
    console.log('Invoice file uploaded for row:', rowId);
    console.log('OCR data:', ocrData);
    console.log('File to upload:', file);
    console.log('File type:', file.type);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';
    if (useMockData) {
      // モックモードでは従来通りローカル状態のみ更新
      const updatedRows = allRows.map((row: any) => {
        if (row.id === rowId) {
          const updatedRow = { ...row };
          updatedRow.invoiceFile = file;
          if (ocrData.date) {
            try {
              const parsedDate = new Date(ocrData.date);
              if (!isNaN(parsedDate.getTime())) {
                updatedRow.invoice_date = parsedDate;
              }
            } catch (e) {
              console.error('Date parsing error:', e);
            }
          }
          if (ocrData.amount) {
            updatedRow.invoice_amount = ocrData.amount;
          }
          if (ocrData.payee) {
            updatedRow.client = ocrData.payee;
          }
          if (!row.isNew) {
            updatedRow.isDirty = true;
          }
          return updatedRow;
        }
        return row;
      });
      setAllRows(updatedRows);
      return;
    }

    try {
      const row = allRows.find((r: any) => r.id === rowId);
      if (!row) {
        setError('行が見つかりません');
        return;
      }

      // OCRデータと既存データをマージ
      const updatedRow = { ...row };

      // OCRで読み取った日付を設定
      let dateValue = row.invoice_date;
      if (ocrData.date) {
        try {
          const parsedDate = new Date(ocrData.date);
          if (!isNaN(parsedDate.getTime())) {
            dateValue = parsedDate;
          }
        } catch (e) {
          console.error('Date parsing error:', e);
        }
      }

      // 新規行の場合は、最低限の情報で行を作成してから請求書をアップロード
      if (row.isNew) {
        // 日付がない場合は今日の日付を使用
        if (!dateValue) {
          dateValue = new Date();
        }

        const formattedDate = formatDateToLocalString(dateValue);
        const formData = new FormData();
        formData.append('invoice_date', formattedDate);
        formData.append('description', row.description || '');
        formData.append('status', row.status || '未払い');
        formData.append('client', ocrData.payee || row.client || '');

        if (ocrData.amount || row.invoice_amount) {
          formData.append('invoice_amount', String(ocrData.amount || row.invoice_amount));
        }

        // 請求書画像を追加
        const invoiceFile = file instanceof Blob && !(file instanceof File)
          ? new File([file], file.name || 'invoice.jpg', { type: file.type })
          : file;
        formData.append('invoice_file', invoiceFile);

        console.log('Creating new invoice with file...');
        const response = await api.post('/invoices', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Invoice created:', response.data);

        // データを再取得
        await fetchInvoices();
      } else {
        // 既存行の場合は、請求書をアップロードして更新
        const formattedDate = dateValue ? formatDateToLocalString(new Date(dateValue)) : formatDateToLocalString(new Date());
        const formData = new FormData();
        formData.append('invoice_date', formattedDate);
        formData.append('description', row.description || '');
        formData.append('status', row.status || '未払い');
        formData.append('client', ocrData.payee || row.client || '');

        if (ocrData.amount != null) {
          formData.append('invoice_amount', String(ocrData.amount));
        } else if (row.invoice_amount != null && row.invoice_amount !== '') {
          formData.append('invoice_amount', String(row.invoice_amount));
        }

        // 請求書画像を追加
        const invoiceFile = file instanceof Blob && !(file instanceof File)
          ? new File([file], file.name || 'invoice.jpg', { type: file.type })
          : file;
        formData.append('invoice_file', invoiceFile);

        console.log('Updating invoice with file:', rowId);
        const response = await api.put(`/invoices/${rowId}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Invoice updated:', response.data);

        // データを再取得
        await fetchInvoices();
      }
    } catch (err: any) {
      console.error('Invoice file upload error:', err);
      setError(err.response?.data?.error || '請求書のアップロードに失敗しました');
    }
  };

  const handleReceiptDelete = (rowId: GridRowId) => async () => {
    console.log('Invoice file deleted for row:', rowId);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';
    if (useMockData) {
      // モックモードでは従来通りローカル状態のみ更新
      const updatedRows = allRows.map((row: any) => {
        if (row.id === rowId) {
          const updatedRow = { ...row };
          delete updatedRow.invoiceFile;
          delete updatedRow.invoice_file_url;
          if (!row.isNew) {
            updatedRow.isDirty = true;
          }
          return updatedRow;
        }
        return row;
      });
      setAllRows(updatedRows);
      return;
    }

    try {
      const row = allRows.find((r: any) => r.id === rowId);
      if (!row) {
        setError('行が見つかりません');
        return;
      }

      // 新規行の場合は、ローカル状態のみ更新
      if (row.isNew) {
        const updatedRows = allRows.map((r: any) => {
          if (r.id === rowId) {
            const updatedRow = { ...r };
            delete updatedRow.invoiceFile;
            delete updatedRow.invoice_file_url;
            return updatedRow;
          }
          return r;
        });
        setAllRows(updatedRows);
        return;
      }

      // 既存行の場合は、バックエンドに削除リクエストを送信
      const dateValue = row.invoice_date ? new Date(row.invoice_date) : new Date();
      const formattedDate = formatDateToLocalString(dateValue);

      const invoiceData: any = {
        invoice_date: formattedDate,
        description: row.description || '',
        status: row.status || '未払い',
        client: row.client || '',
        remove_invoice_file: 'true',
      };

      if (row.invoice_amount != null && row.invoice_amount !== '') {
        invoiceData.invoice_amount = Number(row.invoice_amount);
      }

      console.log('Deleting invoice file for invoice:', rowId);
      const response = await api.put(`/invoices/${rowId}`, invoiceData);
      console.log('Invoice file deleted:', response.data);

      // データを再取得
      await fetchInvoices();
    } catch (err: any) {
      console.error('Invoice file delete error:', err);
      setError(err.response?.data?.error || '請求書の削除に失敗しました');
    }
  };

  const handleDeleteRow = async (id: GridRowId) => {
    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    const row = allRows.find((r: any) => r.id === id);
    if (row && row.isNew) {
      // 新規行の場合は、削除せずに一覧から削除
      setAllRows(allRows.filter((r: any) => r.id !== id));
      return;
    }

    if (useMockData) {
      setAllRows(allRows.filter((row: any) => row.id !== id));
      return;
    }

    try {
      await api.delete(`/invoices/${id}`);
      await fetchInvoices();
    } catch (err: any) {
      setError('削除に失敗しました');
    }
  };

  const handleDeleteClick = (id: GridRowId) => async () => {
    if (window.confirm('この行を削除してもよろしいですか？')) {
      await handleDeleteRow(id);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const columns: GridColDef[] = [
    {
      field: 'user_name',
      headerName: 'ユーザー',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: false,
      hide: user?.role !== 'admin' && user?.role !== 'superadmin',
    },
    {
      field: 'invoice_date',
      headerName: '請求日付',
      width: isMobile ? 90 : 110,
      minWidth: 90,
      editable: true,
      type: 'date',
    },
    {
      field: 'invoice_amount',
      headerName: '請求額',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: true,
      valueFormatter: (params: any) => {
        if (params.value == null || params.value === '') return '';
        return `¥${Number(params.value).toLocaleString()}`;
      },
    },
    {
      field: 'client',
      headerName: '取引先',
      width: isMobile ? 120 : 200,
      minWidth: 100,
      editable: true,
    },
    {
      field: 'description',
      headerName: '摘要',
      width: isMobile ? 150 : 250,
      minWidth: 120,
      flex: isMobile ? 0 : 1,
      editable: true,
    },
    {
      field: 'status',
      headerName: 'ステータス',
      width: isMobile ? 80 : 160,
      minWidth: 80,
      editable: true,
      type: 'singleSelect',
      valueOptions: invoiceStatuses,
      hide: isMobile,
    },
    {
      field: 'invoice',
      headerName: '請求書',
      width: 140,
      minWidth: 120,
      editable: false,
      sortable: false,
      renderCell: (params) => (
        <ReceiptUpload
          receiptUrl={params.row.invoice_file_url}
          isPdf={params.row.is_pdf}
          onReceiptUpload={handleReceiptUpload(params.id)}
          onReceiptDelete={handleReceiptDelete(params.id)}
          disabled={false}
        />
      ),
    },
    ...((user?.role === 'admin' || user?.role === 'superadmin') ? [{
      field: 'updated_at',
      headerName: '更新日',
      width: isMobile ? 50 : 60,
      minWidth: 50,
      editable: false,
      valueGetter: (value: any, row: any) => {
        // 新規追加行は更新日を表示しない
        if (!row || row.isNew) return '';
        if (!value) return '';

        // 作成日と更新日が同じ場合は表示しない（まだ編集されていない）
        if (row.created_at) {
          const createdDate = new Date(row.created_at).toISOString().split('T')[0];
          const updatedDate = new Date(value).toISOString().split('T')[0];
          if (createdDate === updatedDate) return '';
        }

        return value;
      },
      valueFormatter: (value: any) => {
        if (!value) return '';
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) return '';
          return date.toLocaleDateString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
        } catch (e) {
          console.error('Date format error:', e, value);
          return '';
        }
      },
    }] : []),
    {
      field: 'actions',
      type: 'actions',
      headerName: '操作',
      width: isMobile ? 60 : 80,
      cellClassName: 'actions',
      getActions: ({ id }) => {
        return [
          <GridActionsCellItem
            icon={<DeleteIcon />}
            label="削除"
            onClick={handleDeleteClick(id)}
            color="inherit"
          />,
        ];
      },
    },
  ];

  return (
    <Box sx={{ flexGrow: 1 }}>
      {!hideAppBar && (
        <AppBar position="static">
          <Toolbar variant={isMobile ? 'dense' : 'regular'}>
            <Typography
              variant={isMobile ? 'subtitle1' : 'h6'}
              component="div"
              sx={{ flexGrow: 1 }}
            >
              {isMobile ? 'Star R.G 89' : 'Star R.G 89 請求書管理システム'}
            </Typography>
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

      <Container maxWidth="xl" sx={{ mt: isMobile ? 1 : 3, mb: 3, px: isMobile ? 1 : 3 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Box sx={{
          mb: 2,
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 1 : 2,
          alignItems: isMobile ? 'stretch' : 'center',
          flexWrap: 'wrap'
        }}>
          {(user?.role === 'admin' || user?.role === 'superadmin') && (
            <FormControl sx={{ minWidth: isMobile ? '100%' : 200 }} size="small">
              <InputLabel>ユーザー</InputLabel>
              <Select
                value={selectedUser}
                label="ユーザー"
                onChange={(e) => setSelectedUser(e.target.value)}
              >
                <MenuItem value="all">全てのユーザー</MenuItem>
                {availableUsers.map((userName) => (
                  <MenuItem key={userName} value={userName}>
                    {userName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <FormControl sx={{ minWidth: isMobile ? '100%' : 200 }} size="small">
            <InputLabel>表示月</InputLabel>
            <Select
              value={selectedMonth}
              label="表示月"
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              <MenuItem value="all">全ての月</MenuItem>
              {availableMonths.map((month) => (
                <MenuItem key={month} value={month}>
                  {month.replace('-', '年')}月
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', flex: 1 }}>
            <Button
              variant="contained"
              startIcon={!isMobile && <AddIcon />}
              onClick={handleAddRow}
              size="small"
              fullWidth={isMobile}
            >
              {isMobile ? '+ 追加' : '新しい請求書を追加'}
            </Button>
            <Button
              variant="outlined"
              startIcon={!isMobile && <PictureAsPdfIcon />}
              component="div"
              size="small"
              fullWidth={isMobile}
            >
              <PDFExportButton
                transactions={filteredRows as Transaction[]}
                userName={user?.name || 'ユーザー'}
                monthPeriod={selectedMonth !== 'all' ? selectedMonth.replace('-', '年') + '月' : undefined}
              />
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={!isMobile && <SaveIcon />}
              onClick={handleSaveAll}
              size="small"
              fullWidth={isMobile}
            >
              {isMobile ? '保存' : 'すべて保存'}
            </Button>
            {(user?.role === 'admin' || user?.role === 'superadmin') && (
              <Button
                variant="outlined"
                color="success"
                onClick={handleConfirmUpdates}
                size="small"
                fullWidth={isMobile}
              >
                {isMobile ? '確認' : '更新確認'}
              </Button>
            )}
          </Box>
        </Box>

        <Box sx={{
          height: isMobile ? 'calc(100vh - 280px)' : 600,
          width: '100%',
          bgcolor: 'background.paper',
          overflow: 'auto'
        }}>
          <DataGrid
            rows={filteredRows}
            columns={columns}
            getRowId={(row) => row.id}
            editMode="cell"
            apiRef={apiRef}
            sortingMode="client"
            disableMultipleRowSelection
            onCellClick={(params, event) => {
              // 編集可能なセルをクリックした場合、編集モードに切り替える
              const isEditable = params.field !== 'updated_at' &&
                                 params.field !== 'user_name' &&
                                 params.field !== 'invoice' &&
                                 params.field !== 'actions';

              // セルが既に編集モードでない場合のみ編集モードを開始
              if (isEditable && params.isEditable) {
                const cellMode = apiRef.current.getCellMode(params.id, params.field);
                if (cellMode === 'view') {
                  apiRef.current.startCellEditMode({ id: params.id, field: params.field });
                }
              }
            }}
            processRowUpdate={(newRow) => {
              console.log('processRowUpdate called with:', newRow);

              // 全角数字を半角数字に変換する関数
              const toHalfWidth = (value: any): any => {
                if (typeof value !== 'string') return value;
                return value.replace(/[０-９]/g, (s) => {
                  return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
                });
              };

              // 金額フィールドの全角数字を半角に変換
              const processedRow = { ...newRow };
              if (processedRow.invoice_amount) {
                processedRow.invoice_amount = toHalfWidth(String(processedRow.invoice_amount));
              }

              // ローカル状態のみ更新（APIには送信しない）
              // 既存行が編集された場合はisDirtyフラグを設定
              const updatedRows = allRows.map((row: any) =>
                row.id === processedRow.id ? {
                  ...row,
                  ...processedRow,
                  // 請求書関連の情報を保持（DataGridの編集で失われないように）
                  invoiceFile: row.invoiceFile,
                  invoice_file_url: row.invoice_file_url,
                  is_pdf: row.is_pdf,
                  isDirty: !processedRow.isNew
                } : row
              );
              setAllRows(updatedRows);
              return processedRow;
            }}
            onProcessRowUpdateError={(error) => {
              console.error('Row update error:', error);
            }}
            getCellClassName={(params) => {
              // paramsまたはparams.rowが存在しない場合は何も返さない
              if (!params || !params.row) return '';

              // 管理者とスーパー管理者以外は何も返さない
              if (user?.role !== 'admin' && user?.role !== 'superadmin') return '';

              // 更新日列のみハイライト対象
              if (params.field !== 'updated_at') return '';

              // 新規追加行は網掛けなし
              if (params.row.isNew) return '';

              // 更新日が存在する場合のみチェック
              if (params.row.updated_at) {
                try {
                  const updatedDate = new Date(params.row.updated_at).toISOString().split('T')[0];
                  const createdDate = params.row.created_at ? new Date(params.row.created_at).toISOString().split('T')[0] : '';

                  // 作成日より後に更新されている場合
                  if (updatedDate > createdDate) {
                    // 確認日が設定されている場合は確認日より後かチェック
                    if (lastConfirmedDate && updatedDate <= lastConfirmedDate) {
                      return ''; // 確認済み
                    }
                    return 'recently-updated'; // 未確認の更新
                  }
                } catch (e) {
                  console.error('Date comparison error:', e);
                }
              }
              return '';
            }}
            isCellEditable={(params) => params.field !== 'updated_at' && params.field !== 'user_name' && params.field !== 'invoice'}
            disableRowSelectionOnClick
            density={isMobile ? 'compact' : 'standard'}
            pageSizeOptions={[5, 10, 25, 50, 100]}
            sortModel={[]}
            initialState={{
              pagination: {
                paginationModel: { pageSize: isMobile ? 10 : 25 },
              },
            }}
            sx={{
              '& .MuiDataGrid-cell': {
                borderRight: '1px solid rgba(224, 224, 224, 1)',
                fontSize: isMobile ? '0.75rem' : '0.875rem',
                padding: isMobile ? '4px' : '8px',
              },
              '& .MuiDataGrid-columnHeaders': {
                backgroundColor: '#f5f5f5',
                fontWeight: 'bold',
                fontSize: isMobile ? '0.75rem' : '0.875rem',
              },
              '& .MuiDataGrid-row': {
                minHeight: isMobile ? '40px !important' : '52px !important',
              },
              '& .MuiDataGrid-virtualScroller': {
                overflowX: 'auto',
              },
              '& .recently-updated': {
                backgroundColor: '#ffeb3b !important',
              },
            }}
          />
        </Box>
      </Container>
    </Box>
  );
};

export default InvoiceTable;
