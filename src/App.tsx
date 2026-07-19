import { Route, Routes } from 'react-router';
import Home from '@/pages/Home';
import ToolPage from '@/pages/ToolPage';
import Portal from '@/pages/Portal';
import Login from '@/pages/Login';
import Privacy from '@/pages/Privacy';
import Terms from '@/pages/Terms';
import NotFound from '@/pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/app" element={<ToolPage />} />
      <Route path="/portal" element={<Portal />} />
      <Route path="/login" element={<Login />} />
      <Route path="/privatumas" element={<Privacy />} />
      <Route path="/salygos" element={<Terms />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
