import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Employees from '../pages/Employees';
import Customers from '../pages/Customers';

// Simple route test component
const RouteTest = () => {
  return (
    <Routes>
      <Route path="/employees" element={<Employees />} />
      <Route path="/customers" element={<Customers />} />
    </Routes>
  );
};

export default RouteTest;
