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
