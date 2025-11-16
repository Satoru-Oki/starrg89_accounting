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
import api from '../services/api';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

interface Corner {
  x: number;
  y: number;
}

export const CameraCapture = ({ open, onClose, onCapture }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [loading, setLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [corners, setCorners] = useState<Corner[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // カメラを切り替え
  const toggleCamera = () => {
    stopCamera();
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // 枠検出を実行
  const detectCorners = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || detecting) return;

    setDetecting(true);

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

      // canvasをBlobに変換
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.8);
      });

      // FormDataを作成
      const formData = new FormData();
      formData.append('receipt', blob, 'frame.jpg');

      // 枠検出APIを呼び出し
      const response = await api.post('/transactions/detect_receipt_corners', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (response.data.detected && response.data.corners) {
        setCorners(response.data.corners);
      } else {
        setCorners(null);
      }
    } catch (error) {
      console.error('枠検出エラー:', error);
      setCorners(null);
    } finally {
      setDetecting(false);
    }
  }, [detecting]);

  // オーバーレイに枠を描画
  useEffect(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    // canvasをクリア
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (corners && corners.length === 4) {
      // 枠を描画
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners[0][0], corners[0][1]);
      ctx.lineTo(corners[1][0], corners[1][1]);
      ctx.lineTo(corners[2][0], corners[2][1]);
      ctx.lineTo(corners[3][0], corners[3][1]);
      ctx.closePath();
      ctx.stroke();

      // 角に円を描画
      ctx.fillStyle = '#00ff00';
      corners.forEach((corner: any) => {
        ctx.beginPath();
        ctx.arc(corner[0], corner[1], 5, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [corners]);

  // ビデオのサイズが変更されたらオーバーレイcanvasのサイズも変更
  useEffect(() => {
    const video = videoRef.current;
    const overlayCanvas = overlayCanvasRef.current;

    if (!video || !overlayCanvas) return;

    const updateCanvasSize = () => {
      overlayCanvas.width = video.videoWidth;
      overlayCanvas.height = video.videoHeight;
    };

    video.addEventListener('loadedmetadata', updateCanvasSize);

    return () => {
      video.removeEventListener('loadedmetadata', updateCanvasSize);
    };
  }, []);

  // ダイアログが開いたらカメラを起動し、枠検出を開始
  useEffect(() => {
    if (open) {
      startCamera();

      // 500msごとに枠検出を実行
      detectionIntervalRef.current = setInterval(() => {
        detectCorners();
      }, 500);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [open, startCamera, stopCamera, detectCorners]);

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

      // canvasをBlobに変換
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.9);
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

          {/* 枠検出オーバーレイ */}
          <canvas
            ref={overlayCanvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />

          {/* 隠しcanvas（撮影用） */}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* 枠検出中のインジケーター */}
          {detecting && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                left: 16,
                bgcolor: 'rgba(0, 0, 0, 0.6)',
                color: 'white',
                px: 2,
                py: 1,
                borderRadius: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 1,
              }}
            >
              <CircularProgress size={16} color="inherit" />
              <Typography variant="caption">枠を検出中...</Typography>
            </Box>
          )}

          {/* 枠検出成功のメッセージ */}
          {corners && (
            <Box
              sx={{
                position: 'absolute',
                top: 16,
                left: '50%',
                transform: 'translateX(-50%)',
                bgcolor: 'rgba(0, 255, 0, 0.8)',
                color: 'white',
                px: 2,
                py: 1,
                borderRadius: 1,
              }}
            >
              <Typography variant="caption">レシートを検出しました</Typography>
            </Box>
          )}
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
