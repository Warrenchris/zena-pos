import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { usePermissions } from '../hooks/usePermissions'
import { logout } from '../store/slices/authSlice'
import AdminSidebar from './AdminSidebar'
import TopNavBar from './navigation/TopNavBar'

export default function Layout() {
	const [sidebarOpen, setSidebarOpen] = useState(false)
	const location = useLocation()
	const navigate = useNavigate()
	const dispatch = useDispatch()
	const { user } = useSelector((state) => state.auth)
	const { getRoutesByRole } = usePermissions()

	useEffect(() => {
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
	}, [location.pathname, getRoutesByRole, navigate])

	const handleLogout = () => {
		dispatch(logout())
		navigate('/login')
	}

	const Shell = ({ children }) => (
		<div className="min-h-screen bg-brand-black">
			{children}
		</div>
	)

	if (user?.role === 'admin') {
		return (
			<Shell>
				<AdminSidebar 
					isOpen={sidebarOpen} 
					onClose={() => setSidebarOpen(false)} 
					user={user} 
					variant="admin"
				/>
				<div className="lg:pl-80 flex flex-col min-h-screen">
					<TopNavBar />
					<main className="flex-1">
						<div className="w-full">
							<Outlet />
						</div>
					</main>
				</div>
			</Shell>
		)
	}

	return (
		<Shell>
			<AdminSidebar 
				isOpen={sidebarOpen} 
				onClose={() => setSidebarOpen(false)} 
				user={user} 
				variant="cashier"
			/>
			<div className="lg:pl-80 flex flex-col min-h-screen">
				<TopNavBar />
				<main className="flex-1">
					<div className="w-full">
						<Outlet />
					</div>
				</main>
			</div>
		</Shell>
	)
}
