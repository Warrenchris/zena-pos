import React from 'react';
import { Popover } from '@headlessui/react';
import { Calendar } from 'react-calendar';
import { format } from 'date-fns';
import { FaCalendar } from 'react-icons/fa';
import 'react-calendar/dist/Calendar.css';

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
      <Popover.Button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500">
        <FaCalendar className="mr-2" />
        {format(startDate, 'MMM dd, yyyy')} - {format(endDate, 'MMM dd, yyyy')}
      </Popover.Button>

      <Popover.Panel className="absolute z-10 mt-2 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
        {({ close }) => (
          <div className="p-4">
            <div className="custom-calendar-wrapper">
              <style jsx>{`
                .react-calendar {
                  border: none;
                  background-color: white;
                }
                .react-calendar__tile--active {
                  background-color: #3182ce !important;
                  color: white;
                }
                .react-calendar__tile--now {
                  background-color: #f7fafc;
                }
                .react-calendar__tile:enabled:hover {
                  background-color: #ebf8ff;
                }
                .dark .react-calendar {
                  background-color: #1a202c;
                  color: white;
                }
              `}</style>
              <Calendar
                onChange={handleDateChange}
                value={tempDates}
                selectRange={true}
              />
            </div>
            <div className="flex justify-end mt-4 space-x-2">
              <button
                type="button"
                onClick={() => close()}
                className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleApply(close)}
                className="inline-flex items-center px-3 py-1.5 border border-transparent rounded-md text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-500"
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