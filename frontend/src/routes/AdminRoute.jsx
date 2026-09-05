import { Navigate, Outlet } from 'react-router-dom';
import Loading from '../components/Loading/Loading';

function AdminRoute({ user, loading }) {
  if (loading) {
    return (
       <Loading
        text="Checking your session..."
        fullScreen
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export default AdminRoute;