import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogActions,
  IconButton,
  CircularProgress,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import FlipCameraIosIcon from '@mui/icons-material/FlipCameraIos';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export const CameraCapture = ({ open, onClose, onCapture }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // カメラストリームを開始
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingMode },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('カメラの起動に失敗しました:', error);
      alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
  }, [facingMode]);

  // カメラストリームを停止
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  }, []);

  // カメラを切り替え
  const toggleCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // ダイアログが開いたらカメラを起動
  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  // 写真を撮影
  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setLoading(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      // ビデオのサイズに合わせてcanvasのサイズを設定
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // 現在のフレームをcanvasに描画
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // canvasをBlobに変換（高品質）
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.95);
      });

      // BlobをFileに変換
      const file = new File([blob], 'receipt.jpg', { type: 'image/jpeg' });

      // 親コンポーネントにファイルを渡す
      onCapture(file);

      // カメラを停止してダイアログを閉じる
      stopCamera();
      onClose();
    } catch (error) {
      console.error('撮影エラー:', error);
      alert('撮影に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen
    >
      <DialogTitle>
        レシート撮影
        <IconButton
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ p: 0, position: 'relative', bgcolor: 'black' }}>
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* ビデオストリーム */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />

          {/* 隠しcanvas（撮影用） */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
        <Button
          onClick={toggleCamera}
          startIcon={<FlipCameraIosIcon />}
          variant="outlined"
        >
          カメラ切替
        </Button>
        <Button
          onClick={handleCapture}
          startIcon={<CameraAltIcon />}
          variant="contained"
          disabled={loading}
          size="large"
        >
          {loading ? '処理中...' : '撮影'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
