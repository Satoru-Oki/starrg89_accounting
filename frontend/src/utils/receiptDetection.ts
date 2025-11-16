// OpenCV.jsはCDN経由でグローバルにロードされる
declare const cv: any;

export interface Corner {
  x: number;
  y: number;
}

// OpenCV.jsが読み込まれているか確認
let cvReady = false;

// OpenCV.jsの初期化を待つ
export const waitForOpenCV = (): Promise<void> => {
  return new Promise((resolve) => {
    if (cvReady) {
      resolve();
      return;
    }

    // OpenCV.jsが読み込まれるまで待機
    const checkInterval = setInterval(() => {
      if (typeof cv !== 'undefined' && cv && cv.Mat) {
        cvReady = true;
        clearInterval(checkInterval);
        console.log('OpenCV.js loaded successfully');
        resolve();
      }
    }, 100);

    // 30秒でタイムアウト
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!cvReady) {
        console.error('OpenCV.js loading timeout');
      }
      resolve();
    }, 30000);
  });
};

// ビデオ要素から四角形（レシート）の角を検出
export const detectReceiptCorners = (
  videoElement: HTMLVideoElement
): Corner[] | null => {
  if (!cvReady || typeof cv === 'undefined' || !cv || !cv.Mat) {
    console.warn('OpenCV.js is not ready');
    return null;
  }

  let src: any = null;
  let gray: any = null;
  let blurred: any = null;
  let edges: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  let canvas: any = null;

  try {
    // ビデオから画像を取得（canvasを経由）
    canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    // canvasからMatを作成
    src = cv.imread(canvas);

    // グレースケール変換
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // ノイズ除去（ガウシアンブラー）
    blurred = new cv.Mat();
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Cannyエッジ検出（閾値を調整して精度向上）
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 75, 200);

    // モルフォロジー処理でエッジを強化
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, edges, kernel);
    cv.erode(edges, edges, kernel);
    kernel.delete();

    // 輪郭検出
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // 最大面積の四角形を検出
    let maxArea = 0;
    let bestCorners: Corner[] | null = null;
    const imageArea = videoElement.videoWidth * videoElement.videoHeight;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // 画像の3%以上、95%以下の面積がある輪郭のみ対象
      const minArea = imageArea * 0.03;
      const maxAreaLimit = imageArea * 0.95;

      if (area < minArea || area > maxAreaLimit) {
        contour.delete();
        continue;
      }

      // 輪郭を多角形近似（より厳密に）
      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.015 * perimeter, true);

      // 4つの角がある場合のみ処理
      if (approx.rows === 4) {
        // アスペクト比をチェック（レシートっぽい形か）
        const rect = cv.boundingRect(approx);
        const aspectRatio = Math.max(rect.width, rect.height) / Math.min(rect.width, rect.height);

        // アスペクト比が1.2〜4.0の範囲（レシートの一般的な形状）
        if (aspectRatio >= 1.2 && aspectRatio <= 4.0 && area > maxArea) {
          maxArea = area;

          // 4つの角の座標を取得
          const corners: Corner[] = [];
          for (let j = 0; j < 4; j++) {
            corners.push({
              x: approx.data32S[j * 2],
              y: approx.data32S[j * 2 + 1],
            });
          }

          // 角を時計回りに並べ替え（左上、右上、右下、左下）
          bestCorners = sortCorners(corners);
        }
      }

      approx.delete();
      contour.delete();
    }

    return bestCorners;
  } catch (error) {
    console.error('Corner detection error:', error);
    return null;
  } finally {
    // メモリ解放
    if (src) src.delete();
    if (gray) gray.delete();
    if (blurred) blurred.delete();
    if (edges) edges.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
};

// 4つの角を時計回りに並べ替え（左上、右上、右下、左下）
const sortCorners = (corners: Corner[]): Corner[] => {
  // 重心を計算
  const centerX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
  const centerY = corners.reduce((sum, c) => sum + c.y, 0) / 4;

  // 各角がどの位置にあるか判定
  const topLeft = corners.find(c => c.x < centerX && c.y < centerY) || corners[0];
  const topRight = corners.find(c => c.x >= centerX && c.y < centerY) || corners[1];
  const bottomRight = corners.find(c => c.x >= centerX && c.y >= centerY) || corners[2];
  const bottomLeft = corners.find(c => c.x < centerX && c.y >= centerY) || corners[3];

  return [topLeft, topRight, bottomRight, bottomLeft];
};
