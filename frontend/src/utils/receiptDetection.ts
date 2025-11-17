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
  let enhanced: any = null;
  let blurred: any = null;
  let edges: any = null;
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

    // CLAHE（明るさ均一化）で影の影響を軽減（白い紙を強調）
    const clahe = new cv.CLAHE(3.5, new cv.Size(8, 8));
    enhanced = new cv.Mat();
    clahe.apply(gray, enhanced);

    // ノイズ除去（ガウシアンブラー）
    blurred = new cv.Mat();
    cv.GaussianBlur(enhanced, blurred, new cv.Size(5, 5), 0);

    // Cannyエッジ検出（閾値を調整して白い紙を検出しやすく）
    edges = new cv.Mat();
    cv.Canny(blurred, edges, 30, 120);

    // モルフォロジー処理で外側の輪郭を強調
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5));
    cv.dilate(edges, edges, kernel);
    cv.dilate(edges, edges, kernel); // 2回実行して内部の細かい線を消す
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

    // 最大スコアの四角形を検出（外側の白い紙を優先）
    let maxScore = 0;
    let bestCorners: Corner[] | null = null;
    const imageArea = processingWidth * processingHeight;
    const imagePerimeter = 2 * (processingWidth + processingHeight);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      // 画像の15%以上、90%以下の面積がある輪郭のみ対象
      // （内部の小さな四角形を除外しつつ、大きすぎる範囲も除外）
      const minArea = imageArea * 0.15;
      const maxArea = imageArea * 0.90;

      if (area < minArea || area > maxArea) {
        contour.delete();
        continue;
      }

      // 輪郭を多角形近似（厳密に設定して矩形を優先）
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

        // 四角形の品質チェック：角度が直角に近いかを確認
        const angles = [];
        for (let j = 0; j < 4; j++) {
          const p1 = corners[j];
          const p2 = corners[(j + 1) % 4];
          const p3 = corners[(j + 2) % 4];

          // ベクトルを計算
          const v1x = p1.x - p2.x;
          const v1y = p1.y - p2.y;
          const v2x = p3.x - p2.x;
          const v2y = p3.y - p2.y;

          // 内積とベクトルの長さから角度を計算
          const dot = v1x * v2x + v1y * v2y;
          const len1 = Math.sqrt(v1x * v1x + v1y * v1y);
          const len2 = Math.sqrt(v2x * v2x + v2y * v2y);
          const angle = Math.acos(dot / (len1 * len2)) * (180 / Math.PI);
          angles.push(angle);
        }

        // すべての角が60度～120度の範囲にあるかチェック（直角±30度）
        const isRectangular = angles.every(angle => angle >= 60 && angle <= 120);
        if (!isRectangular) {
          approx.delete();
          contour.delete();
          continue;
        }

        // 辺の長さの比率をチェック（対辺がほぼ同じ長さか）
        const side1 = Math.sqrt(Math.pow(corners[1].x - corners[0].x, 2) + Math.pow(corners[1].y - corners[0].y, 2));
        const side2 = Math.sqrt(Math.pow(corners[2].x - corners[1].x, 2) + Math.pow(corners[2].y - corners[1].y, 2));
        const side3 = Math.sqrt(Math.pow(corners[3].x - corners[2].x, 2) + Math.pow(corners[3].y - corners[2].y, 2));
        const side4 = Math.sqrt(Math.pow(corners[0].x - corners[3].x, 2) + Math.pow(corners[0].y - corners[3].y, 2));

        // 対辺の比率が0.7～1.3の範囲にあるかチェック
        const ratio1 = side1 / side3;
        const ratio2 = side2 / side4;
        const hasParallelSides = (ratio1 >= 0.7 && ratio1 <= 1.3) && (ratio2 >= 0.7 && ratio2 <= 1.3);
        if (!hasParallelSides) {
          approx.delete();
          contour.delete();
          continue;
        }

        // スコアリング：面積を最重視（大きな外側の四角形を優先）
        const areaScore = area / imageArea;
        const perimeterScore = perimeter / imagePerimeter;

        // 画面中央からの距離スコア（中央付近の四角形を優先）
        const centerX = processingWidth / 2;
        const centerY = processingHeight / 2;
        const rectCenterX = corners.reduce((sum, c) => sum + c.x, 0) / 4;
        const rectCenterY = corners.reduce((sum, c) => sum + c.y, 0) / 4;
        const distanceFromCenter = Math.sqrt(
          Math.pow(rectCenterX - centerX, 2) + Math.pow(rectCenterY - centerY, 2)
        );
        const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);
        const centerScore = 1 - (distanceFromCenter / maxDistance);

        // 面積を最重視（0.8）、中央付近を少し優先（0.1）、周囲長を少し考慮（0.1）
        const score = areaScore * 0.8 + centerScore * 0.1 + perimeterScore * 0.1;

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
    if (enhanced) enhanced.delete();
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
