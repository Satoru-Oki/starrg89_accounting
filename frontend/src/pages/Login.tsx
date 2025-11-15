import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Paper,
  useTheme,
  useMediaQuery,
} from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      await login(userId, password);
      navigate('/transactions');
    } catch (err: any) {
      setError(err.response?.data?.message || 'ログインに失敗しました');
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        sx={{
          marginTop: isMobile ? 4 : 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          px: isMobile ? 2 : 0,
        }}
      >
        <Paper elevation={3} sx={{ p: isMobile ? 2 : 4, width: '100%' }}>
          <Typography
            component="h1"
            variant={isMobile ? 'h6' : 'h5'}
            align="center"
            sx={{ mb: 2 }}
          >
            Star R.G 89
          </Typography>
          <Typography
            component="h1"
            variant={isMobile ? 'subtitle1' : 'h6'}
            align="center"
            sx={{ mb: 3 }}
          >
            経理清算システム
          </Typography>
          <Typography
            component="h2"
            variant={isMobile ? 'subtitle1' : 'h6'}
            align="center"
            sx={{ mb: 3 }}
          >
            ログイン
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="userId"
              label="ユーザーID"
              name="userId"
              autoComplete="username"
              autoFocus
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="パスワード"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size={isMobile ? 'medium' : 'large'}
              sx={{ mt: 3, mb: 2 }}
            >
              ログイン
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;
