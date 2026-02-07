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
  TextField,
  Menu,
  MenuItem,
} from '@mui/material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import ZoomOutIcon from '@mui/icons-material/ZoomOut';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import imageCompression from 'browser-image-compression';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import api from '../services/api';
import { CameraCapture } from './CameraCapture';

interface ReceiptUploadProps {
  receiptUrl?: string | null;
  hasReceipt?: boolean;
  isPdf?: boolean;
  onReceiptUpload: (file: File, ocrData: OcrData) => void;
  onReceiptDelete?: () => void;
  fetchReceiptUrl?: () => Promise<string | null>;
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
  hasReceipt = false,
  isPdf = false,
  onReceiptUpload,
  onReceiptDelete,
  fetchReceiptUrl,
  disabled = false
}: ReceiptUploadProps) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fetchedReceiptUrl, setFetchedReceiptUrl] = useState<string | null>(null);
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingOcrData, setPendingOcrData] = useState<OcrData | null>(null);
  const [editableOcrData, setEditableOcrData] = useState<OcrData>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string>('');
  const [isPdfPreview, setIsPdfPreview] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
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

    await processFile(file);
  };

  const handleConfirmOcr = () => {
    if (pendingFile) {
      // 親コンポーネントにファイルと編集されたOCRデータを渡す
      onReceiptUpload(pendingFile, editableOcrData);
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

  const handleUploadMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setMenuAnchorEl(event.currentTarget);
  };

  const handleUploadMenuClose = () => {
    setMenuAnchorEl(null);
  };

  const handleCameraClick = () => {
    handleUploadMenuClose();
    setCameraOpen(true);
  };

  const handleFileUploadClick = () => {
    handleUploadMenuClose();
    fileInputRef.current?.click();
  };

  const handleCameraCapture = async (file: File) => {
    // カメラで撮影したファイルを処理
    await processFile(file);
  };

  const handleDeleteClick = () => {
    if (window.confirm('レシート画像を削除しますか？')) {
      onReceiptDelete?.();
    }
  };

  // ファイル処理を共通化
  const processFile = async (file: File) => {
    setLoading(true);
    setError('');

    try {
      let fileToUpload = file;

      // 画像の場合は圧縮処理を実行
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const options = {
          maxSizeMB: 0.7,  // 0.5MB→0.7MBに少し増加
          maxWidthOrHeight: 2400,  // 1920px→2400pxに向上（細かい文字が読める）
          useWebWorker: true,
          initialQuality: 0.85,  // 0.8→0.85に品質向上
        };

        try {
          console.log('元のファイルサイズ:', (file.size / 1024).toFixed(2), 'KB');
          const compressedFile = await imageCompression(file, options);
          console.log('圧縮後のファイルサイズ:', (compressedFile.size / 1024).toFixed(2), 'KB');
          fileToUpload = compressedFile;
        } catch (compressionError) {
          console.error('画像圧縮エラー:', compressionError);
          fileToUpload = file;
        }
      }

      console.log('サーバー側で枠検出・影除去・明るさ補正を実行します...');

      // OCR処理を実行
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
        ocrData = {};
      }

      // ファイルのプレビューURLを作成
      const fileUrl = URL.createObjectURL(fileToUpload);
      setPreviewImageUrl(fileUrl);

      // PDFかどうかを判定
      const isPdf = fileToUpload.type === 'application/pdf';
      setIsPdfPreview(isPdf);

      // 確認ダイアログ用にデータを保存
      setPendingFile(fileToUpload);
      setPendingOcrData(ocrData);
      setEditableOcrData(ocrData);
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

  const handlePreviewOpen = async () => {
    const currentUrl = receiptUrl || fetchedReceiptUrl;
    if (!currentUrl && fetchReceiptUrl) {
      setFetchingUrl(true);
      try {
        const url = await fetchReceiptUrl();
        setFetchedReceiptUrl(url);
      } catch (e) {
        console.error('レシートURL取得エラー:', e);
      } finally {
        setFetchingUrl(false);
      }
    }
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
        onClick={handleUploadMenuOpen}
        disabled={disabled || loading}
        size="small"
        title={(receiptUrl || hasReceipt) ? 'レシート画像を変更' : 'レシート画像をアップロード'}
      >
        {loading ? (
          <CircularProgress size={24} />
        ) : (receiptUrl || hasReceipt) ? (
          <ImageIcon />
        ) : (
          <CameraAltIcon />
        )}
      </IconButton>

      {/* アップロード方法選択メニュー */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleUploadMenuClose}
      >
        <MenuItem onClick={handleCameraClick}>
          <CameraAltIcon sx={{ mr: 1 }} />
          カメラで撮影
        </MenuItem>
        <MenuItem onClick={handleFileUploadClick}>
          <UploadFileIcon sx={{ mr: 1 }} />
          ファイルを選択
        </MenuItem>
      </Menu>

      {/* 閲覧ボタン（画像がある場合） */}
      {(receiptUrl || hasReceipt) && (
        <IconButton
          color="info"
          onClick={handlePreviewOpen}
          disabled={disabled || fetchingUrl}
          size="small"
          title="レシート画像を表示"
        >
          {fetchingUrl ? <CircularProgress size={20} /> : <VisibilityIcon />}
        </IconButton>
      )}

      {/* 削除ボタン（画像がある場合） */}
      {(receiptUrl || hasReceipt) && onReceiptDelete && (
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

      {/* カメラキャプチャーダイアログ */}
      <CameraCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={handleCameraCapture}
      />

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
                    // 画像の場合 - ズーム機能付き
                    <TransformWrapper
                      initialScale={1}
                      minScale={0.5}
                      maxScale={5}
                      centerOnInit={true}
                      wheel={{ step: 0.1, activationKeys: ['Control'] }}
                      doubleClick={{ mode: 'reset' }}
                    >
                      {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                          <Box sx={{ display: 'flex', gap: 1, mb: 0.5, justifyContent: 'center' }}>
                            <IconButton onClick={() => zoomIn()} size="small" color="primary" title="拡大">
                              <ZoomInIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={() => zoomOut()} size="small" color="primary" title="縮小">
                              <ZoomOutIcon fontSize="small" />
                            </IconButton>
                            <IconButton onClick={() => resetTransform()} size="small" color="primary" title="リセット">
                              <RestartAltIcon fontSize="small" />
                            </IconButton>
                          </Box>
                          <TransformComponent
                            wrapperStyle={{
                              width: '100%',
                              height: '480px',
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                            }}
                          >
                            <Box
                              component="img"
                              src={previewImageUrl}
                              alt="レシートプレビュー"
                              sx={{
                                width: '100%',
                                height: 'auto',
                                display: 'block',
                              }}
                            />
                          </TransformComponent>
                        </>
                      )}
                    </TransformWrapper>
                  )}
                </>
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
                  label="支払先"
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

      {/* レシートプレビュー用のダイアログ（画像・PDF対応） */}
      <Dialog
        open={previewOpen}
        onClose={handlePreviewClose}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>レシート</DialogTitle>
        <DialogContent>
          {(receiptUrl || fetchedReceiptUrl) && (
            <>
              {isPdf ? (
                // PDFの場合
                <Box
                  component="iframe"
                  src={receiptUrl || fetchedReceiptUrl || ''}
                  sx={{
                    width: '100%',
                    height: '70vh',
                    border: 'none',
                  }}
                />
              ) : (
                // 画像の場合 - ズーム機能付き
                <TransformWrapper
                  initialScale={1}
                  minScale={0.5}
                  maxScale={5}
                  centerOnInit={true}
                  wheel={{ step: 0.1, activationKeys: ['Control'] }}
                  doubleClick={{ mode: 'reset' }}
                >
                  {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1, justifyContent: 'center' }}>
                        <IconButton onClick={() => zoomIn()} size="small" color="primary" title="拡大">
                          <ZoomInIcon />
                        </IconButton>
                        <IconButton onClick={() => zoomOut()} size="small" color="primary" title="縮小">
                          <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={() => resetTransform()} size="small" color="primary" title="リセット">
                          <RestartAltIcon />
                        </IconButton>
                      </Box>
                      <TransformComponent
                        wrapperStyle={{
                          width: '100%',
                          height: '65vh',
                          border: '1px solid #ddd',
                          borderRadius: '4px',
                        }}
                      >
                        <Box
                          component="img"
                          src={receiptUrl || fetchedReceiptUrl || ''}
                          alt="レシート画像"
                          sx={{
                            width: '100%',
                            height: 'auto',
                            display: 'block',
                          }}
                        />
                      </TransformComponent>
                      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, textAlign: 'center', color: 'text.secondary' }}>
                        Ctrl+マウスホイールで拡大縮小、ダブルクリックでリセット
                      </Typography>
                    </>
                  )}
                </TransformWrapper>
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
