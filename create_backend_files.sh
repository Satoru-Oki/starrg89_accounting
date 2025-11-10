#!/bin/bash
cd /home/satoruoki/projects/accounting-app/backend

# Create migrate directory
mkdir -p db/migrate

# Create User migration
cat > db/migrate/20251109120000_create_users.rb << 'EOF'
class CreateUsers < ActiveRecord::Migration[7.2]
  def change
    create_table :users do |t|
      t.string :user_id, null: false
      t.string :name, null: false
      t.string :email, null: false
      t.string :password_digest, null: false
      t.string :role, default: 'user'

      t.timestamps
    end
    
    add_index :users, :user_id, unique: true
    add_index :users, :email, unique: true
  end
end
EOF

# Create Transaction migration  
cat > db/migrate/20251109120001_create_transactions.rb << 'EOF'
class CreateTransactions < ActiveRecord::Migration[7.2]
  def change
    create_table :transactions do |t|
      t.references :user, null: false, foreign_key: true
      t.date :date, null: false
      t.decimal :deposit_from_star, precision: 10, scale: 2
      t.decimal :payment, precision: 10, scale: 2
      t.string :category
      t.text :description
      t.string :receipt_status
      t.decimal :balance, precision: 10, scale: 2

      t.timestamps
    end
    
    add_index :transactions, :date
    add_index :transactions, [:user_id, :date]
  end
end
EOF

# Create User model
cat > app/models/user.rb << 'EOF'
class User < ApplicationRecord
  has_secure_password
  
  has_many :transactions, dependent: :destroy
  
  validates :user_id, presence: true, uniqueness: true
  validates :email, presence: true, uniqueness: true, format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :name, presence: true
  validates :role, inclusion: { in: %w[admin user] }
end
EOF

# Create Transaction model
cat > app/models/transaction.rb << 'EOF'
class Transaction < ApplicationRecord
  belongs_to :user
  
  validates :date, presence: true
  validates :user, presence: true
  
  scope :by_date, -> { order(date: :desc) }
  scope :for_user, ->(user_id) { where(user_id: user_id) }
  scope :for_month, ->(year, month) { where('EXTRACT(YEAR FROM date) = ? AND EXTRACT(MONTH FROM date) = ?', year, month) }
end
EOF

echo "Files created successfully!"
