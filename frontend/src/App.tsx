import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider } from './contexts/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import MainTable from './pages/MainTable';
import ReceiptDirectory from './pages/ReceiptDirectory';
import InvoiceDirectory from './pages/InvoiceDirectory';
import PaymentDirectory from './pages/PaymentDirectory';
import ClPaymentDirectory from './pages/ClPaymentDirectory';
import PrivateRoute from './components/PrivateRoute';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
  typography: {
    fontFamily: [
      'Roboto',
      'Noto Sans JP',
      'sans-serif',
    ].join(','),
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.15s ease-in-out',
          '&:active': {
            transform: 'scale(0.95)',
            opacity: 0.8,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'all 0.15s ease-in-out',
          '&:active': {
            transform: 'scale(0.9)',
            opacity: 0.7,
          },
        },
      },
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Dashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <PrivateRoute>
                  <MainTable />
                </PrivateRoute>
              }
            />
            <Route
              path="/invoices"
              element={
                <PrivateRoute>
                  <MainTable />
                </PrivateRoute>
              }
            />
            <Route
              path="/receipts"
              element={
                <PrivateRoute>
                  <ReceiptDirectory />
                </PrivateRoute>
              }
            />
            <Route
              path="/invoice-directory"
              element={
                <PrivateRoute>
                  <InvoiceDirectory />
                </PrivateRoute>
              }
            />
            <Route
              path="/payment-details"
              element={
                <PrivateRoute>
                  <MainTable />
                </PrivateRoute>
              }
            />
            <Route
              path="/payment-directory"
              element={
                <PrivateRoute>
                  <PaymentDirectory />
                </PrivateRoute>
              }
            />
            <Route
              path="/cl-payments"
              element={
                <PrivateRoute>
                  <MainTable />
                </PrivateRoute>
              }
            />
            <Route
              path="/cl-payment-directory"
              element={
                <PrivateRoute>
                  <ClPaymentDirectory />
                </PrivateRoute>
              }
            />
            <Route path="/" element={<Navigate to="/transactions" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
