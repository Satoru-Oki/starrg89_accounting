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
  let thresh: any = null;
  let combined: any = null;
  let contours: any = null;
  let hierarchy: any = null;
  let canvas: any = null;

  try {
    // 高解像度での処理を軽くするため、検出時は最大1920pxに縮小
    const originalWidth = videoElement.videoWidth;
    const originalHeight = videoElement.videoHeight;
    const maxDimension = 1920;

    let scale = 1;
    let processingWidth = originalWidth;
    let processingHeight = originalHeight;

    if (originalWidth > maxDimension || originalHeight > maxDimension) {
      scale = Math.min(maxDimension / originalWidth, maxDimension / originalHeight);
      processingWidth = Math.round(originalWidth * scale);
      processingHeight = Math.round(originalHeight * scale);
    }

    // ビデオから画像を取得（canvasを経由、必要に応じて縮小）
    canvas = document.createElement('canvas');
    canvas.width = processingWidth;
    canvas.height = processingHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(videoElement, 0, 0, processingWidth, processingHeight);

    // canvasからMatを作成
    src = cv.imread(canvas);

    // グレースケール変換
    gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // CLAHE（明るさ均一化）で影の影響を軽減
    const clahe = new cv.CLAHE(3.0, new cv.Size(8, 8));
    const enhanced = new cv.Mat();
    clahe.apply(gray, enhanced);

    // ノイズ除去（ガウシアンブラー）
    blurred = new cv.Mat();
    cv.GaussianBlur(enhanced, blurred, new cv.Size(5, 5), 0);

    // 手法1: Cannyエッジ検出（輪郭を検出）
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 40, 120);

    // 手法2: 適応的二値化（白い紙を強調）
    thresh = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      11,
      2
    );

    // エッジと二値化を組み合わせ
    combined = new cv.Mat();
    cv.bitwise_or(edges, thresh, combined);

    // モルフォロジー処理で輪郭を強調
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(combined, combined, kernel);
    cv.dilate(combined, combined, kernel);
    kernel.delete();

    // 輪郭検出
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      combined,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    // メモリ解放
    enhanced.delete();

    // 最大スコアの四角形を検出（外側の白い紙を優先）
    let maxScore = 0;
    let bestCorners: Corner[] | null = null;
    const imageArea = processingWidth * processingHeight;
    const imagePerimeter = 2 * (processingWidth + processingHeight);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // 画像の5%以上の面積がある輪郭のみ対象（小さすぎる輪郭を除外）
      const minArea = imageArea * 0.05;
      // 画像の95%以下の面積（画面全体を検出しないように）
      const maxArea = imageArea * 0.95;

      if (area < minArea || area > maxArea) {
        contour.delete();
        continue;
      }

      // 輪郭を多角形近似（少し厳密に設定）
      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.02 * perimeter, true);

      // 4つの角がある場合のみ処理
      if (approx.rows === 4) {
        // 4つの角の座標を取得
        const corners: Corner[] = [];
        for (let j = 0; j < 4; j++) {
          corners.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          });
        }

        // 四角形の品質チェック
        if (!isValidRectangle(corners, processingWidth, processingHeight)) {
          approx.delete();
          contour.delete();
          continue;
        }

        // 凸性チェック（凹んでいる四角形を除外）
        if (!cv.isContourConvex(approx)) {
          approx.delete();
          contour.delete();
          continue;
        }

        // スコアリング：面積を重視（大きな四角形を優先）
        const areaScore = area / imageArea;
        const perimeterScore = perimeter / imagePerimeter;
        const score = areaScore * 0.7 + perimeterScore * 0.3;

        if (score > maxScore) {
          maxScore = score;

          // 角を時計回りに並べ替え（左上、右上、右下、左下）
          bestCorners = sortCorners(corners);
        }
      }

      approx.delete();
      contour.delete();
    }

    // 縮小して処理した場合は、座標を元の解像度にスケールバック
    if (bestCorners && scale !== 1) {
      bestCorners = bestCorners.map(corner => ({
        x: Math.round(corner.x / scale),
        y: Math.round(corner.y / scale)
      }));
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
    if (thresh) thresh.delete();
    if (combined) combined.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
};

// 四角形の品質をチェック（直角に近いか、アスペクト比が妥当か）
const isValidRectangle = (corners: Corner[], width: number, height: number): boolean => {
  // 4つの辺の長さを計算
  const side1 = distance(corners[0], corners[1]);
  const side2 = distance(corners[1], corners[2]);
  const side3 = distance(corners[2], corners[3]);
  const side4 = distance(corners[3], corners[0]);

  // 対辺の長さが近いかチェック（±30%以内）
  const ratio1 = Math.min(side1, side3) / Math.max(side1, side3);
  const ratio2 = Math.min(side2, side4) / Math.max(side2, side4);

  if (ratio1 < 0.7 || ratio2 < 0.7) {
    return false;
  }

  // アスペクト比が極端でないかチェック（1:5以内）
  const aspectRatio = Math.max(side1, side3) / Math.max(side2, side4);
  if (aspectRatio > 5 || aspectRatio < 0.2) {
    return false;
  }

  // 各角が鋭角すぎないかチェック（30度以上150度以下）
  for (let i = 0; i < 4; i++) {
    const p1 = corners[i];
    const p2 = corners[(i + 1) % 4];
    const p3 = corners[(i + 2) % 4];

    const angle = calculateAngle(p1, p2, p3);
    if (angle < 30 || angle > 150) {
      return false;
    }
  }

  return true;
};

// 2点間の距離を計算
const distance = (p1: Corner, p2: Corner): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// 3点から角度を計算（度数法）
const calculateAngle = (p1: Corner, p2: Corner, p3: Corner): number => {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const det = v1.x * v2.y - v1.y * v2.x;
  const angle = Math.atan2(det, dot);

  return Math.abs(angle * 180 / Math.PI);
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
