import { useState, useRef } from 'react';
import {
  Box,
  IconButton,
  CircularProgress,
  Typography,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  Button,
  Alert,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import imageCompression from 'browser-image-compression';
import api from '../services/api';

interface ReceiptUploadProps {
  receiptUrl?: string | null;
  isPdf?: boolean;
  onReceiptUpload: (file: File, ocrData: OcrData) => void;
  onReceiptDelete?: () => void;
  disabled?: boolean;
}

interface OcrData {
  date?: string;
  amount?: number;
  payee?: string;
  raw_text?: string;
}

export const ReceiptUpload = ({
  receiptUrl,
  isPdf = false,
  onReceiptUpload,
  onReceiptDelete,
  disabled = false
}: ReceiptUploadProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingOcrData, setPendingOcrData] = useState<OcrData | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [isPdfPreview, setIsPdfPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // 画像またはPDFファイルの検証
    const isImage = file.type.startsWith('image/');
    const isPDF = file.type === 'application/pdf';

    if (!isImage && !isPDF) {
      setError('画像ファイルまたはPDFファイルを選択してください');
      return;
    }

    // ファイルサイズ制限（10MB）
    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let fileToUpload = file;

      // 画像の場合は圧縮処理を実行
      if (isImage) {
        const options = {
          maxSizeMB: 0.5, // 最大500KB
          maxWidthOrHeight: 1920, // 最大幅または高さ
          useWebWorker: true, // Web Workerを使用して処理を高速化
          initialQuality: 0.8, // 初期画質
        };

        try {
          console.log('元のファイルサイズ:', (file.size / 1024).toFixed(2), 'KB');
          const compressedFile = await imageCompression(file, options);
          console.log('圧縮後のファイルサイズ:', (compressedFile.size / 1024).toFixed(2), 'KB');
          fileToUpload = compressedFile;
        } catch (compressionError) {
          console.error('画像圧縮エラー:', compressionError);
          // 圧縮に失敗した場合は元のファイルを使用
          fileToUpload = file;
        }
      }

      // OCR処理を実行（失敗しても画像は保存できる）
      let ocrData: OcrData = {};

      try {
        const formData = new FormData();
        formData.append('receipt', fileToUpload);

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
      } catch (ocrError: any) {
        console.warn('OCR処理に失敗しましたが、画像は保存できます:', ocrError);
        // OCRが失敗しても空のデータで続行（手動入力可能）
        ocrData = {};
      }

      // ファイルのプレビューURLを作成（圧縮後のファイルを使用）
      const fileUrl = URL.createObjectURL(fileToUpload);
      setPreviewImageUrl(fileUrl);

      // PDFかどうかを判定
      const isPdf = fileToUpload.type === 'application/pdf';
      setIsPdfPreview(isPdf);

      // 確認ダイアログ用にデータを保存（圧縮後のファイルを使用）
      setPendingFile(fileToUpload);
      setPendingOcrData(ocrData);
      setConfirmDialogOpen(true);

      // 入力フィールドをリセット
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      console.error('ファイル処理エラー:', err);
      setError(err.message || 'ファイル処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmOcr = () => {
    if (pendingFile && pendingOcrData !== null) {
      // 親コンポーネントにファイルとOCRデータを渡す（OCRデータが空でもOK）
      onReceiptUpload(pendingFile, pendingOcrData);
    }
    handleCancelOcr();
  };

  const handleCancelOcr = () => {
    setConfirmDialogOpen(false);
    setPendingFile(null);
    setPendingOcrData(null);
    setIsPdfPreview(false);
    if (previewImageUrl) {
      URL.revokeObjectURL(previewImageUrl);
      setPreviewImageUrl('');
    }
  };

  const handleCameraClick = () => {
    fileInputRef.current?.click();
  };

  const handleDeleteClick = () => {
    if (window.confirm('レシート画像を削除しますか？')) {
      onReceiptDelete?.();
    }
  };

  const handlePreviewOpen = () => {
    setPreviewOpen(true);
  };

  const handlePreviewClose = () => {
    setPreviewOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
      {/* 画像・PDFアップロード用の非表示input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={disabled || loading}
      />

      {/* カメラ/アップロードボタン */}
      <IconButton
        color="primary"
        onClick={handleCameraClick}
        disabled={disabled || loading}
        size="small"
        title={receiptUrl ? 'レシート画像を変更' : 'レシート画像をアップロード'}
      >
        {loading ? (
          <CircularProgress size={24} />
        ) : receiptUrl ? (
          <ImageIcon />
        ) : (
          <CameraAltIcon />
        )}
      </IconButton>

      {/* 閲覧ボタン（画像がある場合） */}
      {receiptUrl && (
        <IconButton
          color="info"
          onClick={handlePreviewOpen}
          disabled={disabled}
          size="small"
          title="レシート画像を表示"
        >
          <VisibilityIcon />
        </IconButton>
      )}

      {/* 削除ボタン（画像がある場合） */}
      {receiptUrl && onReceiptDelete && (
        <IconButton
          color="error"
          onClick={handleDeleteClick}
          disabled={disabled}
          size="small"
          title="レシート画像を削除"
        >
          <DeleteIcon />
        </IconButton>
      )}

      {/* エラー表示用のダイアログ */}
      <Dialog open={!!error} onClose={() => setError('')}>
        <DialogTitle>エラー</DialogTitle>
        <DialogContent>
          <Alert severity="error">{error}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setError('')}>閉じる</Button>
        </DialogActions>
      </Dialog>

      {/* OCR確認ダイアログ */}
      <Dialog
        open={confirmDialogOpen}
        onClose={handleCancelOcr}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>レシート画像とOCRデータの確認</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mt: 1 }}>
            {/* 画像/PDFプレビュー */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                {isPdfPreview ? 'レシートPDF' : 'レシート画像'}
              </Typography>
              {previewImageUrl && (
                <>
                  {isPdfPreview ? (
                    // PDFの場合
                    <Box
                      component="iframe"
                      src={previewImageUrl}
                      sx={{
                        width: '100%',
                        height: '500px',
                        border: '1px solid #ddd',
                        borderRadius: 1,
                      }}
                    />
                  ) : (
                    // 画像の場合
                    <Box
                      component="img"
                      src={previewImageUrl}
                      alt="レシートプレビュー"
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
                </>
              )}
            </Box>

            {/* OCRデータ */}
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                OCRで読み取ったデータ
              </Typography>
              <Box sx={{ p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    日付
                  </Typography>
                  <Typography variant="body1">
                    {pendingOcrData?.date ? new Date(pendingOcrData.date).toLocaleDateString('ja-JP') : '読み取れませんでした'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    金額
                  </Typography>
                  <Typography variant="body1">
                    {pendingOcrData?.amount ? `¥${pendingOcrData.amount.toLocaleString()}` : '読み取れませんでした'}
                  </Typography>
                </Box>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary">
                    支払先
                  </Typography>
                  <Typography variant="body1">
                    {pendingOcrData?.payee || '読み取れませんでした'}
                  </Typography>
                </Box>
                {pendingOcrData?.date || pendingOcrData?.amount || pendingOcrData?.payee ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    読み取れなかった項目や間違っている項目は、後で手動で修正できます。
                  </Alert>
                ) : (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    OCR処理に失敗しました。画像は保存できますので、データは後で手動で入力してください。
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

      {/* レシートプレビュー用のダイアログ（画像・PDF対応） */}
      <Dialog
        open={previewOpen}
        onClose={handlePreviewClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>レシート</DialogTitle>
        <DialogContent>
          {receiptUrl && (
            <>
              {isPdf ? (
                // PDFの場合
                <Box
                  component="iframe"
                  src={receiptUrl}
                  sx={{
                    width: '100%',
                    height: '70vh',
                    border: 'none',
                  }}
                />
              ) : (
                // 画像の場合
                <Box
                  component="img"
                  src={receiptUrl}
                  alt="レシート画像"
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
        <DialogActions>
          <Button onClick={handlePreviewClose}>閉じる</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
