const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

const paginate = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(
    parseInt(req.query.limit) || DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );
  const skip = (page - 1) * limit;

  req.pagination = {
    page,
    limit,
    skip
  };

  next();
};

// Response formatter for paginated results
const formatPaginatedResponse = (req, data, total) => {
  const { page, limit } = req.pagination;
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

module.exports = {
  paginate,
  formatPaginatedResponse
}; 