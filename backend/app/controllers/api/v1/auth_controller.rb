module Api
  module V1
    class AuthController < ApplicationController
      def login
        user = User.find_by(user_id: params[:userId])
        
        if user&.authenticate(params[:password])
          token = JsonWebToken.encode(user_id: user.id)
          render json: {
            token: token,
            user: {
              id: user.id,
              user_id: user.user_id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          }, status: :ok
        else
          render json: { message: 'Invalid credentials' }, status: :unauthorized
        end
      end
      
      def validate
        header = request.headers['Authorization']
        header = header.split(' ').last if header
        begin
          @decoded = JsonWebToken.decode(header)
          user = User.find(@decoded[:user_id])
          render json: {
            user: {
              id: user.id,
              user_id: user.user_id,
              name: user.name,
              email: user.email,
              role: user.role
            }
          }, status: :ok
        rescue ActiveRecord::RecordNotFound, JWT::DecodeError => e
          render json: { errors: e.message }, status: :unauthorized
        end
      end
      
      def logout
        render json: { message: 'Logged out successfully' }, status: :ok
      end
    end
  end
end
