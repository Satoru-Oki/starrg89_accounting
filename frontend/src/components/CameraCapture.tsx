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
import { waitForOpenCV, detectReceiptCorners, Corner } from '../utils/receiptDetection';

interface CameraCaptureProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export const CameraCapture = ({ open, onClose, onCapture }: CameraCaptureProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionFrameRef = useRef<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [corners, setCorners] = useState<Corner[] | null>(null);
  const [cvReady, setCvReady] = useState(false);

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
    // 検出ループを停止
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }
  }, []);

  // ダイアログを閉じる際に状態をリセット
  const handleClose = useCallback(() => {
    setCorners(null);
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  // カメラを切り替え
  const toggleCamera = () => {
    stopCamera();
    setCorners(null); // 枠をリセット
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // リアルタイム検出ループ
  const detectLoop = useCallback(() => {
    if (!videoRef.current || !cvReady || !open) {
      return;
    }

    // 四角形を検出
    const detectedCorners = detectReceiptCorners(videoRef.current);
    setCorners(detectedCorners);

    // 次のフレームで再度検出
    detectionFrameRef.current = requestAnimationFrame(detectLoop);
  }, [cvReady, open]);

  // OpenCV.jsの初期化
  useEffect(() => {
    if (open && !cvReady) {
      waitForOpenCV().then(() => {
        setCvReady(true);
      });
    }
  }, [open, cvReady]);

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

  // ビデオが再生開始したら検出ループを開始
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !open || !cvReady) return;

    const handlePlaying = () => {
      console.log('Video playing, starting detection loop');
      detectLoop();
    };

    // ビデオがすでに再生中の場合
    if (video.readyState >= 3) {
      handlePlaying();
    }

    // playingイベントをリッスン
    video.addEventListener('playing', handlePlaying);

    return () => {
      video.removeEventListener('playing', handlePlaying);
      if (detectionFrameRef.current) {
        cancelAnimationFrame(detectionFrameRef.current);
      }
    };
  }, [open, cvReady, detectLoop]);

  // オーバーレイcanvasに枠を描画
  useEffect(() => {
    if (!overlayCanvasRef.current || !videoRef.current) return;

    const overlayCanvas = overlayCanvasRef.current;
    const ctx = overlayCanvas.getContext('2d');
    if (!ctx) return;

    // canvasサイズをビデオに合わせる
    overlayCanvas.width = videoRef.current.videoWidth;
    overlayCanvas.height = videoRef.current.videoHeight;

    // canvasをクリア
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (corners && corners.length === 4) {
      // 枠を描画
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.stroke();

      // 角に円を描画
      ctx.fillStyle = '#00ff00';
      corners.forEach((corner) => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 8, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [corners]);

  // 写真を撮影
  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    setLoading(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      let finalCanvas = canvas;

      // 枠が検出されている場合は台形補正を適用
      if (corners && corners.length === 4 && cvReady && typeof cv !== 'undefined') {
        console.log('Applying perspective transform with detected corners');

        // 元の画像をcanvasに描画
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // OpenCV.jsで台形補正
        const src = cv.imread(canvas);

        // 検出した4つの角の座標
        const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          corners[0].x, corners[0].y,  // 左上
          corners[1].x, corners[1].y,  // 右上
          corners[2].x, corners[2].y,  // 右下
          corners[3].x, corners[3].y   // 左下
        ]);

        // 目標となる矩形のサイズを計算
        const width1 = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2));
        const width2 = Math.sqrt(Math.pow(corners[2].x - corners[3].x, 2) + Math.pow(corners[2].y - corners[3].y, 2));
        const height1 = Math.sqrt(Math.pow(corners[3].x - corners[0].x, 2) + Math.pow(corners[3].y - corners[0].y, 2));
        const height2 = Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2));

        // 最大サイズを使用（整数に丸める）
        const maxWidth = Math.round(Math.max(width1, width2));
        const maxHeight = Math.round(Math.max(height1, height2));

        // 最小解像度を確保（1200px以上で高品質）
        const scale = Math.max(1, 1200 / Math.min(maxWidth, maxHeight));
        const finalWidth = Math.round(maxWidth * scale);
        const finalHeight = Math.round(maxHeight * scale);

        // 目標となる矩形の座標（スケーリング後のサイズ）
        const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
          0, 0,
          finalWidth, 0,
          finalWidth, finalHeight,
          0, finalHeight
        ]);

        // 透視変換行列を計算
        const M = cv.getPerspectiveTransform(srcPoints, dstPoints);

        // 変換を適用（INTER_CUBICで最高品質）
        const dst = new cv.Mat();
        const dsize = new cv.Size(finalWidth, finalHeight);
        cv.warpPerspective(src, dst, M, dsize, cv.INTER_CUBIC);

        // 結果を新しいcanvasに描画
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = finalWidth;
        trimmedCanvas.height = finalHeight;
        cv.imshow(trimmedCanvas, dst);

        console.log(`Trimmed image size: ${finalWidth}x${finalHeight}`);

        finalCanvas = trimmedCanvas;

        // メモリ解放
        src.delete();
        dst.delete();
        M.delete();
        srcPoints.delete();
        dstPoints.delete();
      } else {
        // 枠が検出されていない場合は通常の撮影
        console.log('No corners detected, capturing full frame');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      // canvasをBlobに変換（最高品質）
      const blob = await new Promise<Blob>((resolve) => {
        finalCanvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/jpeg', 0.98);
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
      onClose={handleClose}
      maxWidth="md"
      fullWidth
      fullScreen
    >
      <DialogTitle>
        レシート撮影
        <IconButton
          onClick={handleClose}
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

          {/* OpenCV読み込み中 */}
          {!cvReady && (
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
              <Typography variant="caption">検出準備中...</Typography>
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
