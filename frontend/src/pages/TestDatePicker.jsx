import React, { useState } from 'react';
import DateRangePicker from '../components/DateRangePicker';

const TestDatePicker = () => {
  const [dateRange, setDateRange] = useState([new Date(), new Date()]);

  return (
    <div className="p-4">
      <DateRangePicker
        startDate={dateRange[0]}
        endDate={dateRange[1]}
        onChange={setDateRange}
      />
      <div className="mt-4">
        Selected Range: {dateRange[0].toDateString()} - {dateRange[1].toDateString()}
      </div>
    </div>
  );
};

export default TestDatePicker;