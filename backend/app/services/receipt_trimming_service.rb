require 'google/cloud/vision'

class ReceiptTrimmingService
  def initialize
    @vision = Google::Cloud::Vision.image_annotator
  end

  # レシート画像を自動トリミング
  def trim_receipt(uploaded_file)
    # 一時ファイルを作成
    tempfile = Tempfile.new(['trimmed_receipt', '.jpg'])

    begin
      # Cloud Vision APIでドキュメント検出
      image = uploaded_file.tempfile.path
      response = @vision.document_text_detection(image: image)

      if response.error
        Rails.logger.error "Vision API error: #{response.error.message}"
        # エラー時は元の画像を返す
        return uploaded_file.tempfile
      end

      # テキスト領域の境界ボックスを取得
      if response.responses.empty? || response.responses.first.full_text_annotation.nil?
        Rails.logger.warn "No text detected in image, returning original"
        return uploaded_file.tempfile
      end

      pages = response.responses.first.full_text_annotation.pages
      if pages.empty?
        Rails.logger.warn "No pages detected, returning original"
        return uploaded_file.tempfile
      end

      # すべてのテキストブロックの境界ボックスを取得
      vertices = []
      pages.first.blocks.each do |block|
        block.bounding_box.vertices.each do |vertex|
          vertices << { x: vertex.x || 0, y: vertex.y || 0 }
        end
      end

      if vertices.empty?
        Rails.logger.warn "No bounding boxes found, returning original"
        return uploaded_file.tempfile
      end

      # 最小・最大座標を取得（マージンを追加）
      min_x = [vertices.map { |v| v[:x] }.min - 20, 0].max
      min_y = [vertices.map { |v| v[:y] }.min - 20, 0].max
      max_x = vertices.map { |v| v[:x] }.max + 20
      max_y = vertices.map { |v| v[:y] }.max + 20

      width = max_x - min_x
      height = max_y - min_y

      # 幅または高さが0以下の場合は元の画像を返す
      if width <= 0 || height <= 0
        Rails.logger.warn "Invalid crop dimensions: #{width}x#{height}, returning original"
        return uploaded_file.tempfile
      end

      Rails.logger.info "Trimming image: x=#{min_x}, y=#{min_y}, width=#{width}, height=#{height}"

      # Vipsで画像をトリミング
      require 'image_processing/vips'
      processed = ImageProcessing::Vips
        .source(uploaded_file.tempfile.path)
        .crop(min_x, min_y, width, height)
        .convert('jpg')
        .saver(quality: 90)
        .call

      # トリミング済み画像を一時ファイルにコピー
      FileUtils.cp(processed.path, tempfile.path)
      processed.close
      processed.unlink

      tempfile.rewind
      Rails.logger.info "Image trimmed successfully"
      tempfile
    rescue StandardError => e
      Rails.logger.error "Receipt trimming error: #{e.message}"
      Rails.logger.error e.backtrace.join("\n")
      tempfile.close
      tempfile.unlink
      # エラー時は元のファイルを新しいTempfileにコピー
      begin
        new_tempfile = Tempfile.new(['receipt_original', '.jpg'])
        uploaded_file.tempfile.rewind
        IO.copy_stream(uploaded_file.tempfile, new_tempfile)
        new_tempfile.rewind
        Rails.logger.info "Returned original file due to trimming error"
        new_tempfile
      rescue => copy_error
        Rails.logger.error "Tempfile copy error: #{copy_error.message}"
        # コピーも失敗した場合は元のtempfileを返す
        uploaded_file.tempfile.rewind
        uploaded_file.tempfile
      end
    end
  end
end
