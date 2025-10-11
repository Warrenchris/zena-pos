import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { usePermissions } from '../hooks/usePermissions'
import { logout } from '../store/slices/authSlice'
import ModernSidebar from './ModernSidebar'
import TopNavBar from './navigation/TopNavBar'

export default function Layout() {
	const [sidebarOpen, setSidebarOpen] = useState(true)
	const location = useLocation()
	const navigate = useNavigate()
	const dispatch = useDispatch()
	const { user } = useSelector((state) => state.auth)
	const { getRoutesByRole } = usePermissions()
	const isLoginPage = location.pathname === '/login'

	useEffect(() => {
		if (!isLoginPage) {
			const allowedRoutes = getRoutesByRole().map(route => route.path)
			const currentPath = location.pathname
			const isAllowed = allowedRoutes.some(path => currentPath === path || currentPath.startsWith(`${path}/`))
			if (!isAllowed) {
				if (currentPath === '/') {
					navigate('/dashboard')
				} else {
					navigate('/dashboard')
				}
			}
		}
	}, [location.pathname, getRoutesByRole, navigate, isLoginPage])

	const handleLogout = () => {
		dispatch(logout())
		navigate('/login')
	}

	const Shell = ({ children }) => (
		<div className="min-h-screen bg-brand-black">
			{children}
		</div>
	)

	// If it's the login page, render only the content without navigation
	if (isLoginPage) {
		return (
			<Shell>
				<main className="flex-1">
					<Outlet />
				</main>
			</Shell>
		)
	}

	// Return the layout with the appropriate sidebar variant
	return (
		<Shell>
			<ModernSidebar 
				isOpen={sidebarOpen} 
				onClose={() => setSidebarOpen(false)} 
				user={user} 
				variant={user?.role === 'admin' ? 'admin' : 'cashier'}
			/>
			<div className={`${user?.role === 'admin' ? 'lg:pl-80' : 'lg:pl-80'} flex flex-col min-h-screen`}>
				<TopNavBar onMenuClick={() => setSidebarOpen(true)} className="z-40" />
				<main className="flex-1 pt-16">
					<div className="w-full px-6">
						<Outlet />
					</div>
				</main>
			</div>
		</Shell>
	)
}
