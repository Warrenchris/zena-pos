import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import DashboardLayout from './DashboardLayout';
import StatsGrid from './StatsGrid';
import RevenueChart from './RevenueChart';
import VisitorGraph from './VisitorGraph';
import OrderTracking from './OrderTracking';
import SellingPlatform from './SellingPlatform';
import LocationAudience from './LocationAudience';
import TopSellingProducts from './TopSellingProducts';

export default function Dashboard() {
    const dispatch = useDispatch();
    const { user } = useSelector((state) => state.auth);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadDashboardData = async () => {
            try {
                setLoading(true);
                // Add your data fetching logic here
                await Promise.all([
                    // Add your async operations here
                ]);
            } catch (error) {
                console.error('Error loading dashboard data:', error);
            } finally {
                setLoading(false);
            }
        };

        loadDashboardData();
    }, [dispatch]);

    if (loading) {
        return (
            <DashboardLayout>
                <div className="flex justify-center items-center min-h-screen">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                </div>
            </DashboardLayout>
        );
    }

    return (
        <DashboardLayout>
            <div className="space-y-6 animate-fadeIn">
                {/* Welcome Section */}
                <div className="bg-surface p-6 rounded-2xl border border-border-default shadow-floating">
                    <h1 className="text-2xl font-bold text-text-primary">Welcome back, {user?.name || 'User'}!</h1>
                    <p className="text-text-secondary mt-1">Here's your business overview</p>
                </div>

                {/* Stats Overview */}
                <div className="grid grid-cols-1 gap-6">
                    <StatsGrid />
                </div>

                {/* Revenue and Visitors Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <RevenueChart />
                    </div>
                    <div>
                        <VisitorGraph />
                    </div>
                </div>

                {/* Orders and Platform Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div>
                        <OrderTracking />
                    </div>
                    <div>
                        <SellingPlatform />
                    </div>
                </div>

                {/* Location and Products Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-1">
                        <LocationAudience />
                    </div>
                    <div className="lg:col-span-2">
                        <TopSellingProducts />
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
