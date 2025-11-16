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
    minHeight: 20,
  },
  tableHeader: {
    backgroundColor: '#f0f0f0',
  },
  tableHeaderText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  tableCol: {
    padding: 5,
    borderRightWidth: 1,
    borderRightColor: '#000',
    overflow: 'hidden',
  },
  tableColText: {
    fontSize: 9,
  },
  tableColDate: {
    width: '10%',
  },
  tableColDeposit: {
    width: '9%',
  },
  tableColPayment: {
    width: '9%',
  },
  tableColPayee: {
    width: '18%',
  },
  tableColCategory: {
    width: '11%',
  },
  tableColDescription: {
    width: '23%',
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

      {/* ヘッダー行 - fixed属性で各ページに表示 */}
      <View style={[styles.tableRow, styles.tableHeader, { borderLeft: '1px solid #000', borderRight: '1px solid #000', borderTop: '1px solid #000' }]} fixed>
        <View style={[styles.tableCol, styles.tableColDate]}>
          <Text style={styles.tableHeaderText}>日付</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColDeposit]}>
          <Text style={styles.tableHeaderText}>入金</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColPayment]}>
          <Text style={styles.tableHeaderText}>支払い</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColPayee]}>
          <Text style={styles.tableHeaderText}>支払先</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColCategory]}>
          <Text style={styles.tableHeaderText}>費目</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColDescription]}>
          <Text style={styles.tableHeaderText}>摘要</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColReceipt]}>
          <Text style={styles.tableHeaderText}>領収書</Text>
        </View>
        <View style={[styles.tableCol, styles.tableColBalance]}>
          <Text style={styles.tableHeaderText}>残金</Text>
        </View>
      </View>

      {/* データ行 */}
      <View style={{ borderLeft: '1px solid #000', borderRight: '1px solid #000', borderBottom: '1px solid #000' }}>
        {transactions.map((transaction, index) => (
          <View key={index} style={styles.tableRow} wrap={false}>
            <View style={[styles.tableCol, styles.tableColDate]}>
              <Text style={styles.tableColText}>{formatDate(transaction.date)}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColDeposit]}>
              <Text style={styles.tableColText}>{transaction.deposit_from_star ? `¥${transaction.deposit_from_star.toLocaleString()}` : ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColPayment]}>
              <Text style={styles.tableColText}>{transaction.payment ? `¥${transaction.payment.toLocaleString()}` : ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColPayee]}>
              <Text style={styles.tableColText}>{transaction.payee || ''}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColCategory]}>
              <Text style={styles.tableColText}>{transaction.category}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColDescription]}>
              <Text style={styles.tableColText}>{transaction.description}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColReceipt]}>
              <Text style={styles.tableColText}>{transaction.receipt_status}</Text>
            </View>
            <View style={[styles.tableCol, styles.tableColBalance]}>
              <Text style={styles.tableColText}>{transaction.balance ? `¥${transaction.balance.toLocaleString()}` : '¥0'}</Text>
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
