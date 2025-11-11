class AddPayeeToTransactions < ActiveRecord::Migration[7.2]
  def change
    add_column :transactions, :payee, :string
  end
end
