module Api
  module V1
    class UsersController < BaseController
      before_action :authorize_admin, only: [:index, :create, :update, :destroy]
      
      def index
        users = User.all
        render json: users.map { |u| user_json(u) }
      end
      
      def show
        user = User.find(params[:id])
        render json: user_json(user)
      end
      
      def create
        user = User.new(user_params)
        
        if user.save
          render json: user_json(user), status: :created
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def update
        user = User.find(params[:id])
        
        if user.update(user_params)
          render json: user_json(user)
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end
      
      def destroy
        user = User.find(params[:id])
        user.destroy
        head :no_content
      end
      
      private
      
      def user_params
        params.require(:user).permit(:user_id, :name, :email, :password, :password_confirmation, :role)
      end
      
      def user_json(user)
        {
          id: user.id,
          user_id: user.user_id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      end
    end
  end
end
