import React from 'react';
import { Popover } from '@headlessui/react';
import { Calendar } from 'react-calendar';
import { format } from 'date-fns';
import { FaCalendar } from 'react-icons/fa';
import 'react-calendar/dist/Calendar.css';
import '../styles/DateRangePicker.css';

const DateRangePicker = ({ startDate, endDate, onChange }) => {
  const [tempDates, setTempDates] = React.useState([startDate, endDate]);

  const handleDateChange = (dates) => {
    setTempDates(dates);
  };

  const handleApply = (close) => {
    onChange(tempDates);
    close();
  };

  return (
    <Popover className="relative">
      <Popover.Button className="inline-flex items-center px-4 py-2 border border-yellow-500/30 rounded-lg shadow-sm text-sm font-medium text-[#FFD600] bg-black/60 hover:bg-[#FFD600]/10 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50 transition-colors">
        <FaCalendar className="mr-2" />
        {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
      </Popover.Button>

      <Popover.Panel className="absolute z-10 mt-2 bg-black/90 rounded-lg shadow-lg border border-yellow-500/20">
        {({ close }) => (
          <div className="p-4">
            <div className="mb-4">
              <Calendar
                onChange={handleDateChange}
                value={tempDates}
                selectRange={true}
                formatMonthYear={(locale, date) => format(date, 'MMMM yyyy')}
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => close()}
                className="px-3 py-1.5 border border-yellow-500/30 rounded-md text-sm font-medium text-gray-300 bg-black/60 hover:bg-[#FFD600]/10 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApply(close)}
                className="px-3 py-1.5 border border-transparent rounded-md text-sm font-medium text-black bg-[#FFD600] hover:bg-[#FFD600]/90 focus:outline-none focus:ring-2 focus:ring-[#FFD600]/50 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </Popover.Panel>
    </Popover>
  );
};

export default DateRangePicker;