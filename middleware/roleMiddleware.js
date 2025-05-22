// Middleware: Role-based Access 
// Middleware for role-based access control
const authorizeRole = (roles) => {
    return (req, res, next) => {
      // Convert single role to array for consistent handling
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      
      // Check if the user has the required role
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        console.log('User role:', req.user?.role);
        console.log('Allowed roles:', allowedRoles);
        return res.status(403).json({ message: 'Forbidden: You do not have access to this resource.' });
      }
      next(); // Allow the request to proceed
    };
  };
  
  module.exports = authorizeRole;
  