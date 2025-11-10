# ユーザーの作成
admin = User.create!(
  user_id: 'admin',
  name: '管理者',
  email: 'admin@example.com',
  password: 'password',
  password_confirmation: 'password',
  role: 'admin'
)

yamada = User.create!(
  user_id: 'yamada',
  name: '山田太郎',
  email: 'yamada@example.com',
  password: 'password',
  password_confirmation: 'password',
  role: 'user'
)

sato = User.create!(
  user_id: 'sato',
  name: '佐藤花子',
  email: 'sato@example.com',
  password: 'password',
  password_confirmation: 'password',
  role: 'user'
)

suzuki = User.create!(
  user_id: 'suzuki',
  name: '鈴木一郎',
  email: 'suzuki@example.com',
  password: 'password',
  password_confirmation: 'password',
  role: 'user'
)

puts "Users created!"

# 取引データの作成
Transaction.create!([
  {
    user: yamada,
    date: '2025-09-01',
    deposit_from_star: 400000,
    category: '',
    description: '9月初期残高',
    balance: 400000
  },
  {
    user: yamada,
    date: '2025-10-01',
    payment: 13200,
    category: '施設費用',
    description: 'CDアツツキ',
    receipt_status: 'PDF配置済',
    balance: 386800
  },
  {
    user: yamada,
    date: '2025-10-15',
    payment: 5000,
    category: '交通費',
    description: '10月出張',
    receipt_status: 'PDF配置済',
    balance: 381800
  },
  {
    user: sato,
    date: '2025-09-01',
    deposit_from_star: 300000,
    category: '',
    description: '9月初期残高',
    balance: 300000
  },
  {
    user: sato,
    date: '2025-10-05',
    payment: 5000,
    category: '交際費',
    description: '10月懇親会',
    receipt_status: 'PDF配置済',
    balance: 295000
  },
  {
    user: sato,
    date: '2025-10-20',
    payment: 8000,
    category: '備品',
    description: 'オフィス用品購入',
    receipt_status: 'PDF配置済',
    balance: 287000
  },
  {
    user: suzuki,
    date: '2025-09-01',
    deposit_from_star: 250000,
    category: '',
    description: '9月初期残高',
    balance: 250000
  },
  {
    user: suzuki,
    date: '2025-10-10',
    payment: 3000,
    category: '交通費',
    description: '取引先訪問',
    receipt_status: 'PDF配置済',
    balance: 247000
  }
])

puts "Transactions created!"
