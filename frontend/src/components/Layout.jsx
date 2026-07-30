import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { usePermissions } from '../hooks/usePermissions'
import { logout } from '../store/slices/authSlice'
import ModernSidebar from './ModernSidebar'
import TopNavBar from './navigation/TopNavBar'

export default function Layout() {
	const [sidebarOpen, setSidebarOpen] = useState(
		typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
	)
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
				navigate('/dashboard')
			}
		}
	}, [location.pathname, getRoutesByRole, navigate, isLoginPage, user])

	useEffect(() => {
		if (typeof window === 'undefined') return

		const handleResize = () => {
			if (window.innerWidth >= 1024) {
				setSidebarOpen(true)
			} else {
				setSidebarOpen(false)
			}
		}

		handleResize()
		window.addEventListener('resize', handleResize)
		return () => window.removeEventListener('resize', handleResize)
	}, [])

	const handleLogout = () => {
		dispatch(logout())
		navigate('/login')
	}

	const Shell = ({ children }) => (
		<div className="min-h-screen bg-surface-0 text-text-primary font-sans antialiased">
			{/* Skip link for keyboard accessibility */}
			<a
				href="#main-content"
				className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-surface-0 focus:font-semibold focus:rounded-lg focus:shadow-lg focus:outline-none"
			>
				Skip to main content
			</a>
			{children}
		</div>
	)

	// If login page, render without navigation
	if (isLoginPage) {
		return (
			<Shell>
				<main id="main-content" className="flex-1">
					<Outlet />
				</main>
			</Shell>
		)
	}

	return (
		<Shell>
			<ModernSidebar
				isOpen={sidebarOpen}
				onClose={() => setSidebarOpen(false)}
				user={user}
				variant={user?.role === 'admin' ? 'admin' : 'cashier'}
			/>
			<div className={`${user?.role === 'admin' ? 'lg:pl-80 2xl:pl-96' : 'lg:pl-72 2xl:pl-80'} flex flex-col min-h-screen transition-[padding-left] duration-300 ease-out`}>
				<TopNavBar
					onMenuClick={() => setSidebarOpen(true)}
					className="z-40"
					isSidebarOpen={sidebarOpen}
				/>
				<main id="main-content" className="flex-1 pt-16 pb-10 safe-area-padding">
					<div className="app-shell app-shell--wide">
						<Outlet />
					</div>
				</main>
			</div>
		</Shell>
	)
}
