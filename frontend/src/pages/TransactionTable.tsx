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

interface TransactionTableProps {
  hideAppBar?: boolean;
}

// ローカル時刻でYYYY-MM-DD形式の文字列に変換するヘルパー関数
const formatDateToLocalString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const TransactionTable = ({ hideAppBar = false }: TransactionTableProps = {}) => {
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

  const categories = [
    '施設費用',
    '交際費',
    '事務用品',
    '交通費',
    '新体操用品',
    '大会参加費',
    '保険',
    '衣装',
    '駐車場',
    'その他',
  ];

  const receiptStatuses = [
    '領収書配置済',
    '確認中',
    '未添付',
  ];

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      setAllRows([]);
      return [];
    }

    try {
      const response = await api.get('/transactions');
      // 日付をDateオブジェクトに変換
      const transactions = response.data.map((t: any) => ({
        ...t,
        date: t.date ? new Date(t.date) : null,
      }));
      console.log('Fetched transactions:', transactions);
      console.log('First transaction updated_at:', transactions[0]?.updated_at);
      setAllRows(transactions);
      return transactions;
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
      if (row.date) {
        try {
          const date = row.date instanceof Date ? row.date : new Date(row.date);
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
        if (!row.date) return false;
        try {
          const date = row.date instanceof Date ? row.date : new Date(row.date);
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

  const handleAddRow = () => {
    const newId = `new-${Date.now()}`;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const newRow: any = {
      id: newId,
      date: null, // OCRで読み取った日付を優先するため、初期値はnull
      deposit_from_star: null,
      payment: null,
      payee: '',
      category: '',
      description: '',
      receipt_status: '未添付',
      balance: 0,
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
    console.log('Has receiptFile?', !!newRow.receiptFile);
    console.log('receiptFile:', newRow.receiptFile);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';

    if (useMockData) {
      const updatedRows = allRows.map((r: any) => (r.id === newRow.id ? newRow : r));
      setAllRows(updatedRows);
      return newRow;
    }

    try {
      // 日付をYYYY-MM-DD形式に変換
      console.log('Raw date value:', newRow.date);
      console.log('Date type:', typeof newRow.date);
      console.log('Is Date object:', newRow.date instanceof Date);

      let dateValue = '';

      // 日付の検証と変換
      if (newRow.date === null || newRow.date === undefined || newRow.date === '') {
        const errorMsg = '日付を入力してください';
        setError(errorMsg);
        throw new Error(errorMsg);
      }

      if (newRow.date instanceof Date) {
        // Dateオブジェクトの場合
        if (isNaN(newRow.date.getTime())) {
          throw new Error('無効な日付です');
        }
        dateValue = formatDateToLocalString(newRow.date);
      } else if (typeof newRow.date === 'string') {
        // 文字列の場合
        if (newRow.date.includes('T')) {
          // ISO形式 "2025-11-09T00:00:00.000Z"
          dateValue = newRow.date.split('T')[0];
        } else if (newRow.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          // 既にYYYY-MM-DD形式
          dateValue = newRow.date;
        } else {
          // その他の形式を試す
          const parsedDate = new Date(newRow.date);
          if (!isNaN(parsedDate.getTime())) {
            dateValue = formatDateToLocalString(parsedDate);
          }
        }
      } else if (typeof newRow.date === 'number') {
        // タイムスタンプの場合
        const parsedDate = new Date(newRow.date);
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

      // レシート画像がある場合はFormDataを使用、ない場合はJSONで送信
      let response;
      const hasReceiptFile = !!newRow.receiptFile;

      if (hasReceiptFile) {
        // FormDataで送信（レシート画像あり）
        const formData = new FormData();
        formData.append('date', dateValue);
        formData.append('category', newRow.category || '');
        formData.append('description', newRow.description || '');
        formData.append('receipt_status', newRow.receipt_status || '未添付');
        formData.append('payee', newRow.payee || '');

        // 入金額の検証
        if (newRow.deposit_from_star != null && newRow.deposit_from_star !== '') {
          const depositValue = Number(newRow.deposit_from_star);
          if (isNaN(depositValue)) {
            throw new Error('入金額は数値で入力してください');
          }
          if (depositValue > 99999999) {
            throw new Error('入金額は99,999,999円以下で入力してください');
          }
          if (depositValue < 0) {
            throw new Error('入金額は0以上で入力してください');
          }
          formData.append('deposit_from_star', depositValue.toString());
        }

        // 支払額の検証
        if (newRow.payment != null && newRow.payment !== '') {
          const paymentValue = Number(newRow.payment);
          if (isNaN(paymentValue)) {
            throw new Error('支払額は数値で入力してください');
          }
          if (paymentValue > 99999999) {
            throw new Error('支払額は99,999,999円以下で入力してください');
          }
          if (paymentValue < 0) {
            throw new Error('支払額は0以上で入力してください');
          }
          formData.append('payment', paymentValue.toString());
        }

        // レシート画像を追加
        // BlobをFileに変換（必要に応じて）
        const receiptFile = newRow.receiptFile instanceof Blob && !(newRow.receiptFile instanceof File)
          ? new File([newRow.receiptFile], newRow.receiptFile.name || 'receipt.jpg', { type: newRow.receiptFile.type })
          : newRow.receiptFile;
        formData.append('receipt', receiptFile);

        console.log('Sending with receipt file');

        if (newRow.isNew) {
          console.log('Creating new transaction with receipt...');
          response = await api.post('/transactions', formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        } else {
          console.log('Updating transaction ID with receipt:', newRow.id);
          response = await api.put(`/transactions/${newRow.id}`, formData, {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          });
        }
      } else {
        // JSONで送信（レシート画像なし）
        const transactionData: any = {
          date: dateValue,
          category: newRow.category || '',
          description: newRow.description || '',
          receipt_status: newRow.receipt_status || '未添付',
          payee: newRow.payee || '',
        };

        // 入金額の検証
        if (newRow.deposit_from_star != null && newRow.deposit_from_star !== '') {
          const depositValue = Number(newRow.deposit_from_star);
          if (isNaN(depositValue)) {
            throw new Error('入金額は数値で入力してください');
          }
          if (depositValue > 99999999) {
            throw new Error('入金額は99,999,999円以下で入力してください');
          }
          if (depositValue < 0) {
            throw new Error('入金額は0以上で入力してください');
          }
          transactionData.deposit_from_star = depositValue;
        }

        // 支払額の検証
        if (newRow.payment != null && newRow.payment !== '') {
          const paymentValue = Number(newRow.payment);
          if (isNaN(paymentValue)) {
            throw new Error('支払額は数値で入力してください');
          }
          if (paymentValue > 99999999) {
            throw new Error('支払額は99,999,999円以下で入力してください');
          }
          if (paymentValue < 0) {
            throw new Error('支払額は0以上で入力してください');
          }
          transactionData.payment = paymentValue;
        }

        console.log('Transaction data to send:', JSON.stringify(transactionData, null, 2));

        if (newRow.isNew) {
          console.log('Creating new transaction...');
          response = await api.post('/transactions', transactionData);
        } else {
          console.log('Updating transaction ID:', newRow.id);
          response = await api.put(`/transactions/${newRow.id}`, transactionData);
        }
      }

      console.log('API Response:', JSON.stringify(response.data, null, 2));

      // データを再取得して、更新された行を取得
      console.log('Fetching updated transactions...');
      const updatedTransactions = await fetchTransactions();

      // 保存/更新した行をIDで検索
      const savedRowId = response.data.id;
      const updatedRow = updatedTransactions.find((t: any) => t.id === savedRowId);

      console.log('=== handleSaveRow SUCCESS ===');
      console.log('Updated row from fetch:', JSON.stringify(updatedRow, null, 2));

      if (!updatedRow) {
        console.warn('Could not find updated row, returning response.data');
        return {
          ...response.data,
          isNew: false,
        };
      }

      // 再取得したデータを返す（balance計算後の正しいデータ）
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
      console.log('Dirty rows data:', dirtyRows.map(r => ({ id: r.id, hasReceiptFile: !!r.receiptFile })));

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
      const refreshedData = await fetchTransactions();
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
    console.log('Receipt uploaded for row:', rowId);
    console.log('OCR data:', ocrData);
    console.log('File to upload:', file);
    console.log('File type:', file.type);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';
    if (useMockData) {
      // モックモードでは従来通りローカル状態のみ更新
      const updatedRows = allRows.map((row: any) => {
        if (row.id === rowId) {
          const updatedRow = { ...row };
          updatedRow.receiptFile = file;
          if (ocrData.date) {
            try {
              const parsedDate = new Date(ocrData.date);
              if (!isNaN(parsedDate.getTime())) {
                updatedRow.date = parsedDate;
              }
            } catch (e) {
              console.error('Date parsing error:', e);
            }
          }
          if (ocrData.amount) {
            updatedRow.payment = ocrData.amount;
          }
          if (ocrData.payee) {
            updatedRow.payee = ocrData.payee;
          }
          updatedRow.receipt_status = '領収書配置済';
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
      let dateValue = row.date;
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

      // 新規行の場合は、最低限の情報で行を作成してからレシートをアップロード
      if (row.isNew) {
        // 日付がない場合は今日の日付を使用
        if (!dateValue) {
          dateValue = new Date();
        }

        const formattedDate = formatDateToLocalString(dateValue);
        const formData = new FormData();
        formData.append('date', formattedDate);
        formData.append('category', ocrData.category || row.category || '');
        formData.append('description', row.description || '');
        formData.append('receipt_status', '領収書配置済');
        formData.append('payee', ocrData.payee || row.payee || '');

        if (ocrData.amount || row.payment) {
          formData.append('payment', String(ocrData.amount || row.payment));
        }

        // レシート画像を追加
        const receiptFile = file instanceof Blob && !(file instanceof File)
          ? new File([file], file.name || 'receipt.jpg', { type: file.type })
          : file;
        formData.append('receipt', receiptFile);

        console.log('Creating new transaction with receipt...');
        const response = await api.post('/transactions', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Transaction created:', response.data);

        // データを再取得
        await fetchTransactions();
      } else {
        // 既存行の場合は、レシートをアップロードして更新
        const formattedDate = dateValue ? formatDateToLocalString(new Date(dateValue)) : formatDateToLocalString(new Date());
        const formData = new FormData();
        formData.append('date', formattedDate);
        formData.append('category', row.category || '');
        formData.append('description', row.description || '');
        formData.append('receipt_status', '領収書配置済');
        formData.append('payee', ocrData.payee || row.payee || '');

        if (row.deposit_from_star != null && row.deposit_from_star !== '') {
          formData.append('deposit_from_star', String(row.deposit_from_star));
        }

        if (ocrData.amount != null) {
          formData.append('payment', String(ocrData.amount));
        } else if (row.payment != null && row.payment !== '') {
          formData.append('payment', String(row.payment));
        }

        // レシート画像を追加
        const receiptFile = file instanceof Blob && !(file instanceof File)
          ? new File([file], file.name || 'receipt.jpg', { type: file.type })
          : file;
        formData.append('receipt', receiptFile);

        console.log('Updating transaction with receipt:', rowId);
        const response = await api.put(`/transactions/${rowId}`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });

        console.log('Transaction updated:', response.data);

        // データを再取得
        await fetchTransactions();
      }
    } catch (err: any) {
      console.error('Receipt upload error:', err);
      setError(err.response?.data?.error || 'レシートのアップロードに失敗しました');
    }
  };

  const handleReceiptDelete = (rowId: GridRowId) => async () => {
    console.log('Receipt deleted for row:', rowId);

    const useMockData = import.meta.env.VITE_USE_MOCK_AUTH === 'true';
    if (useMockData) {
      // モックモードでは従来通りローカル状態のみ更新
      const updatedRows = allRows.map((row: any) => {
        if (row.id === rowId) {
          const updatedRow = { ...row };
          delete updatedRow.receiptFile;
          delete updatedRow.receipt_url;
          updatedRow.receipt_status = '未添付';
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
            delete updatedRow.receiptFile;
            delete updatedRow.receipt_url;
            updatedRow.receipt_status = '未添付';
            return updatedRow;
          }
          return r;
        });
        setAllRows(updatedRows);
        return;
      }

      // 既存行の場合は、バックエンドに削除リクエストを送信
      const dateValue = row.date ? new Date(row.date) : new Date();
      const formattedDate = formatDateToLocalString(dateValue);

      const transactionData: any = {
        date: formattedDate,
        category: row.category || '',
        description: row.description || '',
        receipt_status: '未添付',
        payee: row.payee || '',
      };

      if (row.deposit_from_star != null && row.deposit_from_star !== '') {
        transactionData.deposit_from_star = Number(row.deposit_from_star);
      }

      if (row.payment != null && row.payment !== '') {
        transactionData.payment = Number(row.payment);
      }

      console.log('Deleting receipt for transaction:', rowId);
      const response = await api.put(`/transactions/${rowId}`, transactionData);
      console.log('Receipt deleted:', response.data);

      // データを再取得
      await fetchTransactions();
    } catch (err: any) {
      console.error('Receipt delete error:', err);
      setError(err.response?.data?.error || 'レシートの削除に失敗しました');
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
      await api.delete(`/transactions/${id}`);
      await fetchTransactions();
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
      field: 'date',
      headerName: '日付',
      width: isMobile ? 90 : 110,
      minWidth: 90,
      editable: true,
      type: 'date',
    },
    {
      field: 'deposit_from_star',
      headerName: '入金',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: true,
      valueFormatter: (params: any) => {
        if (params.value == null || params.value === '') return '';
        return `¥${Number(params.value).toLocaleString()}`;
      },
    },
    {
      field: 'payment',
      headerName: '支払い',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: true,
      valueFormatter: (params: any) => {
        if (params.value == null || params.value === '') return '';
        return `¥${Number(params.value).toLocaleString()}`;
      },
    },
    {
      field: 'payee',
      headerName: '支払先',
      width: isMobile ? 120 : 200,
      minWidth: 100,
      editable: true,
    },
    {
      field: 'category',
      headerName: '費目',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: true,
      type: 'singleSelect',
      valueOptions: categories,
      hide: isMobile,
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
      field: 'receipt_status',
      headerName: '領収書',
      width: isMobile ? 80 : 160,
      minWidth: 80,
      editable: true,
      type: 'singleSelect',
      valueOptions: receiptStatuses,
      hide: isMobile,
    },
    {
      field: 'receipt',
      headerName: 'レシート',
      width: 140,
      minWidth: 120,
      editable: false,
      sortable: false,
      renderCell: (params) => (
        <ReceiptUpload
          receiptUrl={params.row.receipt_url}
          isPdf={params.row.is_pdf}
          onReceiptUpload={handleReceiptUpload(params.id)}
          onReceiptDelete={handleReceiptDelete(params.id)}
          disabled={false}
        />
      ),
    },
    {
      field: 'balance',
      headerName: '残金',
      width: isMobile ? 70 : 90,
      minWidth: 70,
      editable: false,
      type: 'number',
      valueFormatter: (params: any) => {
        if (params.value == null || params.value === '') return '';
        return `¥${Number(params.value).toLocaleString()}`;
      },
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
              {isMobile ? 'Star R.G 89' : 'Star R.G 89 経費清算システム'}
            </Typography>
            {!isMobile && (
              <Typography
                variant="body2"
                sx={{
                  color: 'white',
                  fontSize: '0.85rem',
                  mr: 8,
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
              {isMobile ? '+ 追加' : '行を追加'}
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
              const isEditable = params.field !== 'balance' &&
                                 params.field !== 'updated_at' &&
                                 params.field !== 'user_name' &&
                                 params.field !== 'receipt' &&
                                 params.field !== 'actions';
              if (isEditable && params.isEditable) {
                apiRef.current.startCellEditMode({ id: params.id, field: params.field });
              }
            }}
            processRowUpdate={(newRow) => {
              console.log('processRowUpdate called with:', newRow);
              // ローカル状態のみ更新（APIには送信しない）
              // 既存行が編集された場合はisDirtyフラグを設定
              const updatedRows = allRows.map((row: any) =>
                row.id === newRow.id ? {
                  ...row,
                  ...newRow,
                  // レシート関連の情報を保持（DataGridの編集で失われないように）
                  receiptFile: row.receiptFile,
                  receipt_url: row.receipt_url,
                  is_pdf: row.is_pdf,
                  isDirty: !newRow.isNew
                } : row
              );
              setAllRows(updatedRows);
              return newRow;
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
            isCellEditable={(params) => params.field !== 'balance' && params.field !== 'updated_at' && params.field !== 'user_name' && params.field !== 'receipt'}
            disableRowSelectionOnClick
            density={isMobile ? 'compact' : 'standard'}
            pageSizeOptions={[5, 10, 25, 50, 100]}
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

export default TransactionTable;
