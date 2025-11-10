class User < ApplicationRecord
  has_secure_password
  
  has_many :transactions, dependent: :destroy
  
  validates :user_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: %w[admin user] }
end
