import { Document, Page, Text, View, StyleSheet, PDFDownloadLink, Font } from '@react-pdf/renderer';
import { Transaction } from '../types';

// 日本語フォントを登録
Font.register({
  family: 'NotoSansJP',
  src: 'https://fonts.gstatic.com/s/notosansjp/v52/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEi75vY0rw-oME.ttf',
});

// スタイルの定義
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'NotoSansJP',
  },
  header: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  table: {
    width: '100%',
    borderStyle: 'solid',
    borderWidth: 1,
    borderColor: '#000',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#000',
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
  },
  tableCol: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#000',
  },
  tableColDate: {
    width: '10%',
  },
  tableColDeposit: {
    width: '11%',
  },
  tableColPayment: {
    width: '11%',
  },
  tableColPayee: {
    width: '12%',
  },
  tableColCategory: {
    width: '12%',
  },
  tableColDescription: {
    width: '25%',
  },
  tableColReceipt: {
    width: '10%',
  },
  tableColBalance: {
    width: '11%',
  },
  footer: {
    marginTop: 20,
    fontSize: 8,
    textAlign: 'center',
    color: '#666',
  },
});

interface PDFDocumentProps {
  transactions: Transaction[];
  userName: string;
  monthPeriod?: string;
}

// 日付を文字列に変換するヘルパー関数
const formatDate = (date: any): string => {
  if (!date) return '';
  if (date instanceof Date) {
    return date.toLocaleDateString('ja-JP');
  }
  return new Date(date).toLocaleDateString('ja-JP');
};

const TransactionPDFDocument = ({ transactions, userName, monthPeriod }: PDFDocumentProps) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.header}>
        Star R.G 89 経費清算レポート{monthPeriod ? ` - ${monthPeriod}` : ''}
      </Text>
      <Text style={{ marginBottom: 10 }}>作成者: {userName}</Text>
      <Text style={{ marginBottom: 20 }}>作成日: {new Date().toLocaleDateString('ja-JP')}</Text>

      <View style={styles.table}>
        {/* ヘッダー行 */}
        <View style={[styles.tableRow, styles.tableHeader]}>
          <View style={[styles.tableCol, styles.tableColDate]}>
            <Text>日付</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColDeposit]}>
            <Text>Starから入金</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColPayment]}>
            <Text>支払い</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColPayee]}>
            <Text>支払先</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColCategory]}>
            <Text>費目</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColDescription]}>
            <Text>摘要</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColReceipt]}>
            <Text>領収書</Text>
          </View>
          <View style={[styles.tableCol, styles.tableColBalance]}>
            <Text>残金</Text>
          </View>
        </View>

        {/* データ行 */}
        {transactions.map((transaction, index) => (
          <View key={index} style={styles.tableRow}>
            <View style={[styles.tableCol, styles.tableColDate]}>
              <Text>{formatDate(transaction.date)}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColDeposit]}>
              <Text>{transaction.deposit_from_star ? `¥${transaction.deposit_from_star.toLocaleString()}` : ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColPayment]}>
              <Text>{transaction.payment ? `¥${transaction.payment.toLocaleString()}` : ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColPayee]}>
              <Text>{transaction.payee || ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColCategory]}>
              <Text>{transaction.category}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColDescription]}>
              <Text>{transaction.description}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColReceipt]}>
              <Text>{transaction.receipt_status}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColBalance]}>
              <Text>{transaction.balance ? `¥${transaction.balance.toLocaleString()}` : '¥0'}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.footer}>
        Star R.G 89 経費清算システム - {new Date().toLocaleDateString('ja-JP')}
      </Text>
    </Page>
  </Document>
);

interface PDFExportButtonProps {
  transactions: Transaction[];
  userName: string;
  monthPeriod?: string;
}

export const PDFExportButton = ({ transactions, userName, monthPeriod }: PDFExportButtonProps) => {
  const dateStr = monthPeriod || new Date().toISOString().split('T')[0];
  const fileName = `経費レポート_${dateStr}.pdf`;

  return (
    <PDFDownloadLink
      document={<TransactionPDFDocument transactions={transactions} userName={userName} monthPeriod={monthPeriod} />}
      fileName={fileName}
    >
      {({ loading }) => (loading ? 'PDF生成中...' : 'PDFダウンロード')}
    </PDFDownloadLink>
  );
};

export default TransactionPDFDocument;
