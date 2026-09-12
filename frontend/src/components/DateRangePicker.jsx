import React, { useState, useEffect, Fragment } from 'react';
import { Popover, Transition } from '@headlessui/react';
import { Calendar } from 'react-calendar';
import { format, isValid } from 'date-fns';
import { FaCalendar, FaTimes } from 'react-icons/fa';
import 'react-calendar/dist/Calendar.css';
import '../styles/DateRangePicker.css';

const safeFormat = (dateInput, formatStr) => {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!isValid(d)) return '';
  return format(d, formatStr);
};

const DateRangePicker = ({ startDate, endDate, onChange, renderTrigger, align = 'right', panelClassName = '' }) => {
  const parsedStart = startDate ? (typeof startDate === 'string' ? new Date(startDate) : startDate) : new Date();
  const parsedEnd = endDate ? (typeof endDate === 'string' ? new Date(endDate) : endDate) : new Date();

  const [tempDates, setTempDates] = useState([parsedStart, parsedEnd]);

  useEffect(() => {
    const start = startDate ? (typeof startDate === 'string' ? new Date(startDate) : startDate) : new Date();
    const end = endDate ? (typeof endDate === 'string' ? new Date(endDate) : endDate) : new Date();
    setTempDates([start, end]);
  }, [startDate, endDate]);

  const handleDateChange = (dates) => {
    if (Array.isArray(dates)) {
      setTempDates(dates);
    } else if (dates) {
      setTempDates([dates, dates]);
    }
  };

  const handleApply = (close) => {
    if (tempDates && tempDates.length > 0) {
      const start = tempDates[0] || new Date();
      const end = tempDates[1] || tempDates[0] || new Date();
      onChange([start, end]);
    }
    close();
  };

  const formattedStartStr = safeFormat(parsedStart, 'MMM dd, yyyy');
  const formattedEndStr = safeFormat(parsedEnd, 'MMM dd, yyyy');

  return (
    <Popover className="relative inline-block text-left">
      {({ open, close }) => (
        <>
          {renderTrigger ? (
            renderTrigger({ open, close, formattedStartStr, formattedEndStr, parsedStart, parsedEnd })
          ) : (
            <Popover.Button 
              className={`
                inline-flex items-center px-3.5 py-2 border rounded-xl shadow-sm text-xs font-semibold 
                transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500/50
                ${open 
                  ? 'bg-yellow-500/20 border-yellow-500/60 text-brand-yellow ring-2 ring-yellow-500/40' 
                  : 'bg-black/80 border-yellow-500/30 text-brand-yellow hover:bg-yellow-500/10'
                }
              `}
            >
              <FaCalendar className="mr-2 h-3.5 w-3.5 text-brand-yellow flex-shrink-0" />
              <span className="whitespace-nowrap">
                {formattedStartStr && formattedEndStr 
                  ? `${formattedStartStr} - ${formattedEndStr}`
                  : 'Select Date Range'
                }
              </span>
            </Popover.Button>
          )}

          <Transition
            as={Fragment}
            enter="transition ease-out duration-200"
            enterFrom="opacity-0 translate-y-1 scale-95"
            enterTo="opacity-100 translate-y-0 scale-100"
            leave="transition ease-in duration-150"
            leaveFrom="opacity-100 translate-y-0 scale-100"
            leaveTo="opacity-0 translate-y-1 scale-95"
          >
            <Popover.Panel className={`absolute ${align === 'left' ? 'left-0' : 'right-0 sm:left-0'} z-[100] mt-2 w-auto bg-surface/98 backdrop-blur-md rounded-2xl shadow-floating border border-border-default p-4 min-w-[340px] text-text-primary ${panelClassName}`}>
              {({ close }) => (
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border-default pb-2.5">
                    <div>
                      <h4 className="text-small font-bold text-text-primary">Select Date Range</h4>
                      <p className="text-caption text-text-muted mt-0.5">
                        {tempDates[0] ? safeFormat(tempDates[0], 'MMM dd, yyyy') : 'Start'}
                        {' → '}
                        {tempDates[1] ? safeFormat(tempDates[1], 'MMM dd, yyyy') : (tempDates[0] ? safeFormat(tempDates[0], 'MMM dd, yyyy') : 'End')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => close()}
                      className="p-1.5 rounded-lg hover:bg-surface-2 text-text-muted hover:text-text-primary transition-colors"
                      aria-label="Close calendar"
                    >
                      <FaTimes className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="custom-calendar-container flex justify-center py-1">
                    <Calendar
                      onChange={handleDateChange}
                      value={tempDates}
                      selectRange={true}
                      formatMonthYear={(locale, date) => safeFormat(date, 'MMMM yyyy')}
                    />
                  </div>

                  <div className="flex justify-end items-center space-x-2 pt-2.5 border-t border-border-default">
                    <button
                      type="button"
                      onClick={() => close()}
                      className="px-3.5 py-1.5 border border-border-default rounded-xl text-small font-medium text-text-secondary bg-surface hover:bg-surface-2 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApply(close)}
                      className="px-4 py-1.5 rounded-xl text-small font-bold text-white bg-primary hover:bg-primary-hover transition-all shadow-sm"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              )}
            </Popover.Panel>
          </Transition>
        </>
      )}
    </Popover>
  );
};

export default DateRangePicker;