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
import RestartAltIcon from '@mui/icons-material/RestartAlt';
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
  const [corners, setCorners] = useState<Corner[] | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const [selectedCornerIndex, setSelectedCornerIndex] = useState<number | null>(null);
  const [detectionPaused, setDetectionPaused] = useState(false); // 検出を一時停止するフラグ

  // カメラストリームを開始
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',  // 背面カメラ固定
          width: { ideal: 3840, min: 1920 },  // 4K理想、最低Full HD
          height: { ideal: 2160, min: 1080 },
          aspectRatio: { ideal: 1.777777778 }, // 16:9
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
      }
    } catch (error) {
      console.error('カメラの起動に失敗しました:', error);
      alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
  }, []);

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
    setDetectionPaused(false);
    setSelectedCornerIndex(null);
    stopCamera();
    onClose();
  }, [onClose, stopCamera]);

  // 検出枠をリセット
  const resetFrame = () => {
    setCorners(null);
    setSelectedCornerIndex(null);
    setDetectionPaused(false); // 検出を再開
  };

  // canvas座標系に変換（画面座標 → ビデオ解像度座標）
  const getCanvasCoordinates = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!overlayCanvasRef.current || !videoRef.current) return null;

    const canvas = overlayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // canvas要素内の相対座標（0-1の範囲）
    const relativeX = (clientX - rect.left) / rect.width;
    const relativeY = (clientY - rect.top) / rect.height;

    // ビデオ解像度での座標に変換
    const x = relativeX * videoRef.current.videoWidth;
    const y = relativeY * videoRef.current.videoHeight;

    return { x, y };
  };

  // タッチ/マウス開始：角を選択
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!corners) return;

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (!coords) return;

    if (!videoRef.current) return;

    // ビデオ解像度を取得
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;

    // 基本タッチ半径: 250px（ビデオ解像度座標）に拡大
    const baseTouchRadius = 250;

    // 各角との距離を計算し、最も近い角を選択（画面端の頂点は優先的に選択）
    let closestCornerIndex = -1;
    let closestDistance = Infinity;

    for (let i = 0; i < corners.length; i++) {
      const corner = corners[i];
      const distance = Math.sqrt(
        Math.pow(coords.x - corner.x, 2) + Math.pow(coords.y - corner.y, 2)
      );

      // 画面端からの距離を計算
      const edgeMargin = 400; // 端から400px以内を「端付近」とみなす
      const isNearEdge =
        corner.x < edgeMargin ||
        corner.x > videoWidth - edgeMargin ||
        corner.y < edgeMargin ||
        corner.y > videoHeight - edgeMargin;

      // 端付近の頂点はタッチ半径を2倍に拡大（より広い範囲でタッチ可能）
      const effectiveTouchRadius = isNearEdge ? baseTouchRadius * 2 : baseTouchRadius;

      // タッチ範囲内で最も近い角を選択
      if (distance <= effectiveTouchRadius && distance < closestDistance) {
        closestDistance = distance;
        closestCornerIndex = i;
      }
    }

    // 最も近い角を選択
    if (closestCornerIndex !== -1) {
      setSelectedCornerIndex(closestCornerIndex);
      e.preventDefault();
    }
  };

  // タッチ/マウス移動：角の位置を更新
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (selectedCornerIndex === null || !corners) return;

    const coords = getCanvasCoordinates(e.clientX, e.clientY);
    if (!coords) return;

    // 選択中の角の位置を更新
    const newCorners = [...corners];
    newCorners[selectedCornerIndex] = coords;
    setCorners(newCorners);

    e.preventDefault();
  };

  // タッチ/マウス終了：選択解除
  const handlePointerUp = () => {
    setSelectedCornerIndex(null);
  };

  // リアルタイム検出ループ
  const detectLoop = useCallback(() => {
    if (!videoRef.current || !cvReady || !open) {
      return;
    }

    // 検出が一時停止中、またはドラッグ中は検出を実行しない
    if (!detectionPaused && selectedCornerIndex === null) {
      // 四角形を検出
      const detectedCorners = detectReceiptCorners(videoRef.current);
      // 検出に成功した場合のみ枠を更新し、検出を一時停止
      if (detectedCorners) {
        setCorners(detectedCorners);
        setDetectionPaused(true); // 検出成功したら自動検出を停止
      }
    }

    // 次のフレームで再度検出（一時停止中でも、リセット時に即座に再開できるようループは継続）
    detectionFrameRef.current = requestAnimationFrame(detectLoop);
  }, [cvReady, open, selectedCornerIndex, detectionPaused]);

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
      setDetectionPaused(false); // 開いた時は検出を開始
    } else {
      stopCamera();
      setCorners(null); // ダイアログが閉じたら枠をリセット
      setDetectionPaused(false);
    }

    return () => {
      stopCamera();
      setCorners(null);
      setDetectionPaused(false);
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
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.stroke();

      // 角に円を描画（大きめのサイズで指での操作をしやすく）
      corners.forEach((corner, index) => {
        // 選択中の角は大きく、それ以外は通常サイズ（サイズを20%増）
        const isSelected = index === selectedCornerIndex;
        const radius = isSelected ? 85 : 60; // 通常60px（旧50px）、選択時85px（旧70px）

        // 外側の円（白い縁）を太くして視認性向上
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, radius + 8, 0, 2 * Math.PI);
        ctx.fill();

        // 内側の円（緑）
        ctx.fillStyle = isSelected ? '#ffff00' : '#00ff00';  // 選択中は黄色
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, radius, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }, [corners, selectedCornerIndex]);

  // 写真を撮影
  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    // 撮影ボタンを押した瞬間に検出ループを停止して枠を固定
    if (detectionFrameRef.current) {
      cancelAnimationFrame(detectionFrameRef.current);
      detectionFrameRef.current = null;
    }

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

        // 最小解像度を確保（1600px以上で高品質）
        const scale = Math.max(1, 1600 / Math.min(maxWidth, maxHeight));
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

        // 影除去処理（CLAHE: Contrast Limited Adaptive Histogram Equalization）
        const shadowRemoved = new cv.Mat();

        // RGBからLab色空間に変換
        const lab = new cv.Mat();
        cv.cvtColor(dst, lab, cv.COLOR_RGB2Lab);

        // Labチャンネルを分離
        const channels = new cv.MatVector();
        cv.split(lab, channels);

        // Lチャンネル（明度）にCLAHEを適用して影を軽減
        const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
        const lChannel = channels.get(0);
        clahe.apply(lChannel, lChannel);

        // チャンネルを結合してRGBに戻す
        cv.merge(channels, lab);
        cv.cvtColor(lab, shadowRemoved, cv.COLOR_Lab2RGB);

        // メモリ解放
        lab.delete();
        channels.delete();
        lChannel.delete();
        dst.delete();

        // シャープネス処理でエッジを強調（OCR精度向上）
        const sharpened = new cv.Mat();
        const kernel = cv.matFromArray(3, 3, cv.CV_32F, [
          0, -1, 0,
          -1, 5, -1,
          0, -1, 0
        ]);
        cv.filter2D(shadowRemoved, sharpened, cv.CV_8U, kernel);
        kernel.delete();
        shadowRemoved.delete();

        // 結果を新しいcanvasに描画
        const trimmedCanvas = document.createElement('canvas');
        trimmedCanvas.width = finalWidth;
        trimmedCanvas.height = finalHeight;
        cv.imshow(trimmedCanvas, sharpened);

        console.log(`Trimmed image size: ${finalWidth}x${finalHeight}`);

        sharpened.delete();

        finalCanvas = trimmedCanvas;

        // メモリ解放
        src.delete();
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

      // カメラは開いたままにして、連続撮影を可能にする
      // ユーザーが手動で閉じるまで検出を続ける
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              touchAction: 'none',
              cursor: selectedCornerIndex !== null ? 'grabbing' : (corners ? 'grab' : 'default'),
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
              <Typography variant="caption">
                {selectedCornerIndex !== null
                  ? '角をドラッグして調整中...'
                  : 'レシートを検出しました（角をドラッグして調整可能）'}
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ justifyContent: 'space-between', p: 2 }}>
        <Button
          onClick={resetFrame}
          startIcon={<RestartAltIcon />}
          variant="outlined"
        >
          枠リセット
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
