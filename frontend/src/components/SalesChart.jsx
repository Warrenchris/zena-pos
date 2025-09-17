import { Area } from '@ant-design/charts'
import { formatCurrency } from '../utils/formatters'

export default function SalesChart({ data = [] }) {
  const chartData = data.map(sale => ({
    date: new Date(sale.createdAt).toLocaleDateString(),
    amount: sale.total
  }));

  const config = {
    data: chartData,
    xField: 'date',
    yField: 'amount',
    smooth: true,
    areaStyle: {
      fill: 'l(270) 0:#ffffff 0.5:#7ec2f3 1:#1890ff',
    },
    line: {
      color: '#1890ff',
    },
    xAxis: {
      type: 'time',
      tickCount: 5,
    },
    yAxis: {
      label: {
        formatter: (v) => formatCurrency(v),
      },
    },
    tooltip: {
      showMarkers: true,
      formatter: (datum) => {
        return { name: 'Sales', value: formatCurrency(datum.amount) };
      },
    },
    animation: {
      appear: {
        animation: 'path-in',
        duration: 1000,
      },
    },
  }

  return <Area {...config} />
}