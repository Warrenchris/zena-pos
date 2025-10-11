import React from 'react';
import { Line } from 'react-chartjs-2';
// Register ChartJS components
import 'chart.js/auto';

type ForecastData = {
  dates: string[];
  actual?: number[];
  predictions: number[];
  lower_bounds: number[];
  upper_bounds: number[];
}

const ForecastChart: React.FC<{ data: ForecastData }> = ({ data }) => {
  const chartData = {
    labels: data.dates,
    datasets: [
      {
        label: 'Actual Revenue',
        data: data.actual,
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.1)',
        fill: true,
      },
      {
        label: 'Predicted Revenue',
        data: data.predictions,
        borderColor: 'rgb(54, 162, 235)',
        borderDash: [5, 5],
        fill: false,
      },
      {
        label: 'Confidence Interval',
        data: data.upper_bounds,
        borderColor: 'rgba(54, 162, 235, 0.2)',
        backgroundColor: 'rgba(54, 162, 235, 0.1)',
        fill: '+1',
        pointRadius: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      title: {
        display: true,
        text: 'Revenue Forecast',
      },
      tooltip: {
        mode: 'index',
        intersect: false,
      },
    },
    hover: {
      mode: 'nearest',
      intersect: true,
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: 'Date',
        },
      },
      y: {
        display: true,
        title: {
          display: true,
          text: 'Revenue ($)',
        },
  min: data.lower_bounds && data.lower_bounds.length ? Math.min(...data.lower_bounds) * 0.9 : undefined,
  max: data.upper_bounds && data.upper_bounds.length ? Math.max(...data.upper_bounds) * 1.1 : undefined,
      },
    },
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4">Revenue Forecast</h2>
      <div className="h-96">
        <Line data={chartData} options={options} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <p className="font-semibold text-gray-600">Forecast Period</p>
          <p>{data.dates.length} days</p>
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-600">Confidence Level</p>
          <p>95%</p>
        </div>
        <div className="text-center">
          <p className="font-semibold text-gray-600">Last Updated</p>
          <p>{new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </div>
  );
};

export default ForecastChart;