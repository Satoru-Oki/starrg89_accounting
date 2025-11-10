module Api
  module V1
    class BaseController < ApplicationController
      before_action :authenticate_request
      
      attr_reader :current_user
      
      private
      
      def authenticate_request
        header = request.headers['Authorization']
        header = header.split(' ').last if header
        begin
          @decoded = JsonWebToken.decode(header)
          @current_user = User.find(@decoded[:user_id])
        rescue ActiveRecord::RecordNotFound => e
          render json: { errors: e.message }, status: :unauthorized
        rescue JWT::DecodeError => e
          render json: { errors: e.message }, status: :unauthorized
        end
      end
      
      def authorize_admin
        render json: { error: 'Unauthorized' }, status: :forbidden unless current_user&.role == 'admin'
      end
    end
  end
end
