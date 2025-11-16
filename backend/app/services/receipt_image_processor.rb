require 'mini_magick'
require 'google/cloud/vision'

class ReceiptImageProcessor
  # 画像を処理（枠検出、台形補正、影除去、明るさ補正）
  def process_receipt_image(image_path)
    begin
      # Google Cloud Vision APIでドキュメントの角を検出
      corners = detect_document_corners(image_path)

      # 角が検出された場合は台形補正を実行
      if corners && corners.length == 4
        Rails.logger.info "ドキュメントの角を検出: #{corners.inspect}"
        image_path = apply_perspective_correction(image_path, corners)
      else
        Rails.logger.info "ドキュメントの角が検出できませんでした。補正をスキップします。"
      end

      # 影除去と明るさ補正（しっかりモード）
      processed_path = apply_shadow_removal_and_brightness(image_path)

      {
        success: true,
        processed_image_path: processed_path,
        corners_detected: !corners.nil?
      }
    rescue StandardError => e
      Rails.logger.error "画像処理エラー: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      {
        success: false,
        error: e.message,
        processed_image_path: image_path # エラー時は元の画像を返す
      }
    end
  end

  private

  # Google Cloud Vision APIでドキュメントの角を検出
  def detect_document_corners(image_path)
    begin
      # Vision APIクライアントを作成
      vision = Google::Cloud::Vision.image_annotator

      # ドキュメント検出を実行（ファイルパスを直接渡す）
      response = vision.document_text_detection(image: image_path)

      # エラーチェック（responses配列の最初の要素をチェック）
      if response.responses.empty? || response.responses.first.error&.message.present?
        error_msg = response.responses.first&.error&.message || "レスポンスが空です"
        Rails.logger.error "Vision API Error: #{error_msg}"
        return nil
      end

      # ページの境界ボックスを取得（responses配列の最初の要素から取得）
      annotation = response.responses.first.full_text_annotation

      if annotation&.pages&.any?
        page = annotation.pages.first

        if page.blocks.any?
          # すべてのブロックを含む最小の矩形を計算
          all_vertices = []
          page.blocks.each do |block|
            block.bounding_box.vertices.each do |vertex|
              all_vertices << [vertex.x || 0, vertex.y || 0]
            end
          end

          # 4つの角を計算（左上、右上、右下、左下）
          return calculate_corners(all_vertices)
        end
      end

      nil
    rescue StandardError => e
      Rails.logger.error "Vision API エラー: #{e.message}"
      nil
    end
  end

  # 頂点群から4つの角を計算
  def calculate_corners(vertices)
    return nil if vertices.empty?

    # X座標とY座標の範囲を取得
    x_coords = vertices.map { |v| v[0] }
    y_coords = vertices.map { |v| v[1] }

    min_x = x_coords.min
    max_x = x_coords.max
    min_y = y_coords.min
    max_y = y_coords.max

    # 4つの角を返す（左上、右上、右下、左下）
    [
      [min_x, min_y],  # 左上
      [max_x, min_y],  # 右上
      [max_x, max_y],  # 右下
      [min_x, max_y]   # 左下
    ]
  end

  # 台形補正を適用
  def apply_perspective_correction(image_path, corners)
    begin
      image = MiniMagick::Image.open(image_path)

      # 画像のサイズを取得
      width = image.width
      height = image.height

      # 目標となる矩形の座標（画像全体）
      dest_corners = [
        [0, 0],           # 左上
        [width, 0],       # 右上
        [width, height],  # 右下
        [0, height]       # 左下
      ]

      # ImageMagickの-distort perspectiveコマンド用の座標文字列を作成
      # 形式: "x1,y1 x1',y1' x2,y2 x2',y2' ..."
      distort_args = corners.zip(dest_corners).map do |src, dest|
        "#{src[0]},#{src[1]} #{dest[0]},#{dest[1]}"
      end.join(' ')

      # 台形補正を適用
      output_path = Tempfile.new(['corrected', '.jpg']).path
      image.combine_options do |c|
        c.distort 'Perspective', distort_args
        c.virtual_pixel 'white'
      end
      image.write(output_path)

      output_path
    rescue StandardError => e
      Rails.logger.error "台形補正エラー: #{e.message}"
      image_path # エラー時は元の画像を返す
    end
  end

  # 影除去と明るさ補正（しっかりモード）
  def apply_shadow_removal_and_brightness(image_path)
    begin
      image = MiniMagick::Image.open(image_path)

      # 出力ファイルパス
      output_path = Tempfile.new(['processed', '.jpg']).path

      # しっかりした影除去と明るさ補正
      image.combine_options do |c|
        # グレースケール化（OCR精度向上）
        c.colorspace 'Gray'

        # 影除去の前処理：モルフォロジー処理で影を軽減
        c.morphology 'Close', 'Rectangle:1x5'

        # コントラストストレッチ（暗い部分を明るく）
        c.contrast_stretch '2%x1%'

        # 明るさとコントラストの調整（しっかりモード）
        # 第1引数: 明るさ (+15は15%明るく)
        # 第2引数: コントラスト (+25は25%コントラスト強化)
        c.brightness_contrast '15x25'

        # 正規化（自動レベル調整で最適化）
        c.normalize

        # 白レベルと黒レベルの調整（背景を白く、文字を黒く）
        c.white_threshold '92%'
        c.black_threshold '8%'

        # シャープネス適用（文字をくっきり）
        c.sharpen '0x1.5'

        # ノイズ除去
        c.despeckle
      end

      image.write(output_path)

      Rails.logger.info "影除去・明るさ補正完了: #{output_path}"
      output_path
    rescue StandardError => e
      Rails.logger.error "影除去・明るさ補正エラー: #{e.message}"
      image_path # エラー時は元の画像を返す
    end
  end
end
