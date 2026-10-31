import { createBrowserRouter, RouterProvider } from 'react-router';
import { WelcomePage } from '../features/welcome/WelcomePage';

const router = createBrowserRouter([{ path: '/', element: <WelcomePage /> }]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
