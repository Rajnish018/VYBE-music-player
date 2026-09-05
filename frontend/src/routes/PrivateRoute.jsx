import { Navigate, Outlet } from 'react-router-dom';
import Loading from '../components/Loading/Loading';

function PrivateRoute({ user, loading }) {
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

  return <Outlet />;
}

export default PrivateRoute;