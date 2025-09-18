function isValidEmail(email) {
  return /.+@.+\..+/.test(String(email || '').toLowerCase());
}

function isISODate(value) {
  if (!value) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function validateEmployee(payload) {
  if (!payload) return 'Invalid payload';
  if (!payload.firstName || String(payload.firstName).trim().length === 0) return 'First name is required';
  if (!payload.lastName || String(payload.lastName).trim().length === 0) return 'Last name is required';
  if (!payload.email || !isValidEmail(payload.email)) return 'Valid email is required';
  if (!payload.position || String(payload.position).trim().length === 0) return 'Position is required';

  const status = payload.status || 'active';
  if (!['active', 'inactive'].includes(status)) return 'Status must be active or inactive';

  if (payload.salary == null || isNaN(Number(payload.salary)) || Number(payload.salary) < 0) {
    return 'Salary must be a non-negative number';
  }

  if (payload.hireDate && !isISODate(payload.hireDate)) {
    return 'Hire date must be a valid date';
  }

  return null;
}

module.exports = { validateEmployee };


